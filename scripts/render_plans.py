"""Render converted DXF floor-plan sheets to clean SVG linework for the web.

Pipeline (Windows):
  1. DWG -> DXF with the free ODA File Converter (installed per-user, no admin needed):
     "%LOCALAPPDATA%\Programs\ODA\ODAFileConverter 27.1.0\ODAFileConverter.exe" ^
       "C:\garden view\Building_Plans" <dxf_dir> ACAD2018 DXF 0 1 "*.dwg"
  2. DXF -> SVG:  python scripts/render_plans.py <dxf_dir> web/public/plans [levels]
     e.g. levels "3,4,g" to re-render only some sheets. Needs: pip install ezdxf matplotlib
  3. Minify:      npx svgo --config scripts/svgo.config.js -f web/public/plans

Output: one SVG per sheet named by level id (level-3.svg, level-g.svg, level-b1.svg ...),
monochrome ink-coloured linework on a transparent background so the page can put it on
cream paper. Also writes a manifest.json with extents and entity counts for sanity checks.
"""
import json
import re
import sys
from pathlib import Path

import ezdxf
from ezdxf.addons.drawing import Frontend, RenderContext, config, layout, svg

INK = "#2a2b25"

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


def render(dxf_path: Path, out_path: Path, level: str) -> dict:
    doc = ezdxf.readfile(str(dxf_path))
    msp = doc.modelspace()
    ctx = RenderContext(doc)
    backend = svg.SVGBackend()
    cfg = config.Configuration(
        background_policy=config.BackgroundPolicy.OFF,
        color_policy=config.ColorPolicy.CUSTOM,
        custom_fg_color=INK,
        lineweight_policy=config.LineweightPolicy.RELATIVE,
        min_lineweight=0.12,
        text_policy=config.TextPolicy.OUTLINE,
    )
    frontend = Frontend(ctx, backend, config=cfg)
    crop = CROP.get(level)
    if crop is None:
        frontend.draw_layout(msp)
    else:
        # draw_layout (not draw_entities) so the layout's background policy is applied;
        # the crop is a filter that drops entities lying wholly outside the window.
        xmin, ymin, xmax, ymax = crop

        def inside(e) -> bool:
            b = ezdxf.bbox.extents([e], fast=True)
            if not b.has_data:
                return False
            return not (b.extmax.x < xmin or b.extmin.x > xmax or b.extmax.y < ymin or b.extmin.y > ymax)

        frontend.draw_layout(msp, filter_func=inside)
    page = layout.Page(0, 0, layout.Units.mm, margins=layout.Margins.all(8))
    svg_text = backend.get_string(page)
    out_path.write_text(svg_text, encoding="utf-8")

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
            print(f"ok  level-{level}: {info['bytes'] // 1024} KB, extents={info['extents']}, top={list(info['entities'])[:3]}")
        except Exception as exc:  # keep going; report at the end
            manifest.append({"level": level, "source": dxf_path.name, "error": str(exc)})
            print(f"ERR level-{level}: {exc}")
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
