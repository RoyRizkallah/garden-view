r"""Render converted DXF floor-plan sheets to clean SVG linework for the web.

Pipeline (Windows):
  1. DWG -> DXF with the free ODA File Converter (installed per-user, no admin needed):
     "%LOCALAPPDATA%\Programs\ODA\ODAFileConverter 27.1.0\ODAFileConverter.exe" ^
       "C:\garden view\Building_Plans" <dxf_dir> ACAD2018 DXF 0 1 "*.dwg"
  2. DXF -> SVG:  python scripts/render_plans.py <dxf_dir> web/public/plans [levels]
     e.g. levels "3,4,g" to re-render only some sheets. Needs: pip install ezdxf matplotlib
  3. Minify:      npx svgo@3 --config scripts/svgo.config.js -f web/public/plans

Output: one SVG per sheet named by level id (level-3.svg, level-g.svg, level-b1.svg ...),
monochrome ink-coloured linework on a transparent background so the page can put it on
cream paper. Also writes a manifest.json with extents and entity counts for sanity checks.

The sheets are served as plain <img> sources to a pan/zoom viewer (100 %-400 %), so the
raw ezdxf output is slimmed for the web before svgo sees it:
  * dense pattern hatches (wall/concrete/shaft fills whose lines sit closer than a screen
    pixel) become one flat fill whose opacity matches the ink coverage of the lines;
  * coordinates are re-emitted on a 100-unit grid of the 1 000 000-unit viewBox inside a
    scale() group (0.009 mm on the sheet, ~0.1 px at maximum zoom), halving the digits;
  * the invisible background rect goes.
The viewBox, crop windows and stroke weights are unchanged.
"""
import json
import re
import sys
import time
from pathlib import Path

import ezdxf
from ezdxf.addons.drawing import Frontend, RenderContext, config, layout, svg
from ezdxf.math import area
from ezdxf.render import hatching

INK = "#2a2b25"

# ezdxf maps the sheet's long side onto a 0..1_000_000 integer viewBox (layout.Settings).
VIEW_BOX_SPACE = 1_000_000
# Page margins used for the auto-sized sheet, in mm (1 drawing unit = 1 mm on the page).
MARGIN_MM = 8.0

# The web viewer shows the sheet's long side at ~680 CSS px at 100 % and zooms to 400 %.
STAGE_PX = 680

# Coordinates are re-emitted on this grid (in viewBox units) inside a scale() group.
COORD_STEP = 100

# Pattern hatches whose line spacing is under this many CSS px at 100 % render as a grey
# tone at every zoom the viewer offers; they are replaced by a flat fill of equal coverage.
DENSE_HATCH_PX = 1.0

# DWG/DXF file stem -> plan level id (matches web/src/data/floorPlans.ts)
LEVEL_IDS = {
    "A101-BASEMENT-3": "b3",
    "A102-BASEMENT-2": "b2",
    "A103-BASEMENT-1": "b1",
    "A104-Ground floor": "g",
    "A105-floor1": "1",
    "A106-Floor2": "2",
    "A107-Floor3": "3",
    "A108-Floor4": "4",
    "A109-Floor5": "5",
    "A108-Floor6": "6",
    "A209-Floor7": "7",
    "A112-Floor8": "8",
    "A113-Floor9": "9",
    "A114-Floor10": "10",
}


# Model-space crop windows (xmin, ymin, xmax, ymax) for sheets that carry content
# unrelated to the plan: a stray interior drawing far off-sheet on Level 3, the
# floating sheet title on Level 4, and wide site-context linework around Ground.
CROP = {
    "3": (-5.0, -25.0, 50.0, 65.0),
    "4": (-5.0, -8.0, 50.0, 65.0),
    "g": (-12.0, -18.0, 58.0, 78.0),
}


# ---------- hatch flattening ----------


def loops_area(loops) -> float:
    """Even-odd area of hatch boundary loops: the largest loop minus the rest (islands)."""
    areas = sorted((abs(area(list(loop.flattening(0.01)))) for loop in loops), reverse=True)
    return max(0.0, areas[0] - sum(areas[1:])) if areas else 0.0


def flat_hatch_alpha(hatch, stroke_du: float, dense_spacing: float, cfg: config.Configuration):
    """Alpha (1..255) for drawing this pattern hatch as one flat fill, or None to keep its lines.

    Generates the pattern lines exactly as the drawing frontend does and measures their ink,
    so the flat tone matches what the lines paint. Only hatches denser than `dense_spacing`
    (drawing units) qualify, and only when the area their lines cover agrees with the area
    of the boundary polygon: ezdxf's line hatching and solid filling disagree on some odd
    boundary polylines, and those keep their lines so the look never changes.
    """
    try:
        baselines = list(
            hatching.pattern_baselines(
                hatch, min_hatch_line_distance=cfg.min_hatch_line_distance, jiggle_origin=True
            )
        )
    except hatching.HatchingError:
        return None
    if not baselines or min(abs(b.normal_distance) for b in baselines) >= dense_spacing:
        return None
    loops = hatching.hatch_boundary_paths(hatch, filter_text_boxes=True)
    if not loops:
        return None

    t0 = time.perf_counter()

    def timeout() -> bool:
        return time.perf_counter() - t0 > cfg.hatching_timeout

    covered = 0.0
    clear = 1.0  # fraction left unpainted after every line family
    for baseline in baselines:
        spacing = abs(baseline.normal_distance)
        family_area = 0.0
        ink = 0.0
        for line in hatching.hatch_paths(baseline, loops, timeout):
            family_area += (line.end - line.start).magnitude * spacing
            for s, e in baseline.pattern_renderer(line.distance).render(line.start, line.end):
                # round caps add a stroke-wide disc to every dash and dot
                ink += ((e - s).magnitude + 0.8 * stroke_du) * stroke_du
        if family_area <= 0:
            return None
        covered += family_area
        clear *= 1.0 - min(1.0, ink / family_area)
    covered /= len(baselines)
    polygon = loops_area(loops)
    if abs(covered - polygon) > 0.25 * max(covered, polygon):
        return None
    return max(1, min(255, round((1.0 - clear) * 255 / 5) * 5))  # ~2 % steps


def hatch_stroke_units(ctx: RenderContext, hatch, settings: layout.Settings) -> int:
    """Stroke width (viewBox units) the SVG backend gives this hatch's pattern lines."""
    lineweight = ctx.resolve_all(hatch).lineweight  # mm, LineweightPolicy.RELATIVE mapping
    max_sw = int(settings.output_coordinate_space * settings.max_stroke_width)
    min_sw = int(max_sw * settings.min_stroke_width)
    return svg.map_lineweight_to_stroke_width(lineweight, min_sw, max_sw)


# ---------- SVG slimming ----------

_PATH_TOKENS = re.compile(r"[A-Za-z]|-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?")


def rescale_path(d: str, step: int) -> str:
    """Re-emit an ezdxf path (M/m, L/l, Q/q, C/c, Z) as absolute commands on a `step` grid.

    Positions are tracked in the original units and rounded once, so no error accumulates
    along long polylines; svgo turns the result back into relative shorthand losslessly.
    """
    out: list[str] = []
    tokens = _PATH_TOKENS.findall(d)
    n = len(tokens)
    i = 0
    x = y = sx = sy = 0.0
    cmd = ""

    def q(v: float) -> str:
        return str(round(v / step))

    def take(count: int) -> list[float]:
        nonlocal i
        vals = [float(t) for t in tokens[i : i + count]]
        if len(vals) != count:
            raise ValueError(f"truncated path data after {cmd!r}")
        i += count
        return vals

    while i < n:
        t = tokens[i]
        if t.isalpha():
            cmd = t
            i += 1
            if cmd in "Zz":
                out.append("Z")
                x, y = sx, sy
                cmd = ""
            continue
        if cmd in "Mm":
            nx, ny = take(2)
            if cmd == "m":
                nx, ny = nx + x, ny + y
            x, y = sx, sy = nx, ny
            out.append(f"M{q(x)} {q(y)}")
            cmd = "L" if cmd == "M" else "l"  # implicit line-to after a move-to
        elif cmd in "Ll":
            nx, ny = take(2)
            if cmd == "l":
                nx, ny = nx + x, ny + y
            x, y = nx, ny
            out.append(f"L{q(x)} {q(y)}")
        elif cmd in "Qq":
            cx, cy, nx, ny = take(4)
            if cmd == "q":
                cx, cy, nx, ny = cx + x, cy + y, nx + x, ny + y
            x, y = nx, ny
            out.append(f"Q{q(cx)} {q(cy)} {q(nx)} {q(ny)}")
        elif cmd in "Cc":
            c1x, c1y, c2x, c2y, nx, ny = take(6)
            if cmd == "c":
                c1x, c1y, c2x, c2y, nx, ny = c1x + x, c1y + y, c2x + x, c2y + y, nx + x, ny + y
            x, y = nx, ny
            out.append(f"C{q(c1x)} {q(c1y)} {q(c2x)} {q(c2y)} {q(nx)} {q(ny)}")
        else:
            raise ValueError(f"unsupported path command {cmd!r} in ezdxf SVG output")
    return " ".join(out)


def slim_svg(svg_text: str, step: int = COORD_STEP) -> str:
    """Coarsen coordinates inside a scale() group and drop the invisible background."""
    # ezdxf emits the (transparent) page background as the first <rect>; nothing to see.
    svg_text = re.sub(r"<rect\b[^>]*/>", "", svg_text, count=1)
    # stroke widths are viewBox units; keep the visual weight under the scale() group
    svg_text = re.sub(
        r"stroke-width: (\d+(?:\.\d+)?);",
        lambda m: f"stroke-width: {float(m.group(1)) / step:g};",
        svg_text,
    )
    svg_text = svg_text.replace("<g ", f'<g transform="scale({step})" ', 1)
    return re.sub(
        r'(<path\b[^>]*\bd=")([^"]*)(")',
        lambda m: m.group(1) + rescale_path(m.group(2), step) + m.group(3),
        svg_text,
    )


# ---------- rendering ----------


def render(dxf_path: Path, out_path: Path, level: str) -> dict:
    doc = ezdxf.readfile(str(dxf_path))
    msp = doc.modelspace()
    ctx = RenderContext(doc)
    backend = svg.SVGBackend()
    settings = layout.Settings()
    cfg = config.Configuration(
        background_policy=config.BackgroundPolicy.OFF,
        color_policy=config.ColorPolicy.CUSTOM,
        custom_fg_color=INK,
        lineweight_policy=config.LineweightPolicy.RELATIVE,
        min_lineweight=0.12,
        text_policy=config.TextPolicy.OUTLINE,
    )
    crop = CROP.get(level)

    def inside(e) -> bool:
        # the crop is a filter that drops entities lying wholly outside the window
        if crop is None:
            return True
        b = ezdxf.bbox.extents([e], fast=True)
        if not b.has_data:
            return False
        xmin, ymin, xmax, ymax = crop
        return not (b.extmax.x < xmin or b.extmin.x > xmax or b.extmax.y < ymin or b.extmin.y > ymax)

    # viewBox units per drawing unit: the auto-sized page is content + margins, 1 unit = 1 mm
    content = ezdxf.bbox.extents((e for e in msp if inside(e)), fast=True)
    long_side = max(content.size.x, content.size.y) if content.has_data else 1.0
    units_per_du = VIEW_BOX_SPACE / (long_side + 2 * MARGIN_MM)
    dense_spacing = DENSE_HATCH_PX * (VIEW_BOX_SPACE / STAGE_PX) / units_per_du  # drawing units

    # Dense pattern hatches are drawn as flat fills grouped by ink coverage (alpha 1..255).
    flat: dict[int, list] = {}
    kept = 0
    for hatch in msp.query("HATCH"):
        if hatch.dxf.solid_fill or hatch.pattern is None or not inside(hatch):
            continue
        stroke_du = hatch_stroke_units(ctx, hatch, settings) / units_per_du
        alpha = flat_hatch_alpha(hatch, stroke_du, dense_spacing, cfg)
        if alpha is None:
            kept += 1
        else:
            flat.setdefault(alpha, []).append(hatch)
    flat_handles = {h.dxf.handle for group in flat.values() for h in group}

    # draw_layout (not draw_entities) so the layout's background policy is applied
    frontend = Frontend(ctx, backend, config=cfg)
    frontend.draw_layout(msp, filter_func=lambda e: inside(e) and e.dxf.handle not in flat_handles)
    for alpha, hatches in sorted(flat.items()):
        flat_cfg = cfg.with_changes(
            hatch_policy=config.HatchPolicy.SHOW_SOLID, custom_fg_color=f"{INK}{alpha:02x}"
        )
        Frontend(ctx, backend, config=flat_cfg).draw_entities(hatches)

    page = layout.Page(0, 0, layout.Units.mm, margins=layout.Margins.all(MARGIN_MM))
    svg_text = backend.get_string(page, settings=settings, xml_declaration=False)
    out_path.write_text(slim_svg(svg_text), encoding="utf-8")

    bbox = ezdxf.bbox.extents(msp, fast=True)
    counts: dict[str, int] = {}
    for e in msp:
        counts[e.dxftype()] = counts.get(e.dxftype(), 0) + 1
    return {
        "source": dxf_path.name,
        "svg": out_path.name,
        "bytes": out_path.stat().st_size,
        "extents": [list(bbox.extmin), list(bbox.extmax)] if bbox.has_data else None,
        "entities": dict(sorted(counts.items(), key=lambda kv: -kv[1])[:8]),
        "layers": len(doc.layers),
        "flat_hatches": len(flat_handles),
        "line_hatches": kept,
    }


def main() -> None:
    dxf_dir, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    only = set(sys.argv[3].split(",")) if len(sys.argv) > 3 else None  # optional level filter
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = []
    for dxf_path in sorted(dxf_dir.glob("*.dxf")):
        level = LEVEL_IDS.get(dxf_path.stem)
        if level is None:
            print(f"skip (unknown sheet): {dxf_path.name}")
            continue
        if only is not None and level not in only:
            continue
        out_path = out_dir / f"level-{level}.svg"
        try:
            info = render(dxf_path, out_path, level)
            manifest.append({"level": level, **info})
            print(
                f"ok  level-{level}: {info['bytes'] // 1024} KB, hatches flat/lines={info['flat_hatches']}/{info['line_hatches']}, "
                f"extents={info['extents']}, top={list(info['entities'])[:3]}"
            )
        except Exception as exc:  # keep going; report at the end
            manifest.append({"level": level, "source": dxf_path.name, "error": str(exc)})
            print(f"ERR level-{level}: {exc}")
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
