r"""Build the 3D explorer's building from the as-built floor plans.

The explorer used to show three invented boxes. Everything it needs is already in the
per-level plan models: one floor plate per sheet, the glazing lines that sit on the
outer wall, the level 9 terraces and the ground-floor gardens. This script reads those,
co-registers the sheets that were drawn at their own origin, simplifies the geometry to
what reads at building scale, and writes one small file the explorer loads:

    python scripts/build_massing.py            # web/public/plans/massing.json

Coordinates are metres in the reference sheet's frame (x right, y up on paper); the
viewer maps y -> -z. Storey heights are NOT in the drawings — the plans are all plan
views — so the floor-to-floor figures stay the viewer's stated assumption; only the
footprints, glazing and terraces here are measured.
"""
import json
import re
from pathlib import Path

from shapely.geometry import LineString, Polygon, MultiLineString
from shapely.geometry import Point
from shapely.ops import linemerge, nearest_points, unary_union

ROOT = Path(__file__).resolve().parent.parent
PLANS = ROOT / "web" / "public" / "plans"

# Sheets drawn at their own origin, translated into the reference frame (same table the
# plan pipeline uses; see SHEET_TO_REFERENCE in extract_plan3d.py).
SHEET_TO_REFERENCE = {"5": (0.0, 138.736), "6": (0.0, 162.35), "8": (-91.65, 0.0), "9": (-463.738, 0.0), "10": (-195.388, 0.0)}

LEVELS = [("g", 0), ("1", 1), ("2", 2), ("3", 3), ("4", 4), ("5", 5), ("6", 6), ("7", 7), ("8", 8), ("9", 9), ("10", 10)]

# How far a glazing line may sit from the outer wall and still count as a facade window.
FACADE_BAND_M = 0.8
# Runs shorter than this are mullion crumbs, not windows.
MIN_RUN_M = 0.5
# Plan detail below this reads as noise once the whole building is on screen.
RING_TOLERANCE_M = 0.12
# How far the floor slab stands proud of the wall it caps.
SLAB_OVERHANG_M = 0.2
# The parcel drawn around the building; the grounds are whatever it does not cover.
PARCEL_MARGIN_M = 7.0
# Rooms the sheets name as open-air: carved out of the storey so the balcony is a real recess.
OPEN_AIR_ROOM = re.compile(r"balcon|terrace|loggia", re.I)
R = 2


def r2(v):
    return round(v, R)


def shift(pt, off):
    return (pt[0] + off[0], pt[1] + off[1])


def ring_out(poly, tol=RING_TOLERANCE_M):
    """Exterior ring as [[x, y], ...], simplified, first point not repeated."""
    s = poly.simplify(tol)
    if s.is_empty or not s.exterior:
        return None
    ext = s.exterior
    # always counter-clockwise, so the viewer can rely on the winding when it extrudes
    coords = list(ext.coords if ext.is_ccw else ext.coords[::-1])
    pts = [(r2(x), r2(y)) for x, y in coords[:-1]]
    return [list(p) for p in pts] if len(pts) >= 3 else None


def facade_runs(windows, solid, off):
    """
    Glazing on a wall the open air reaches, merged into straight runs.

    `solid` is the storey with its balconies already carved out, so its boundary is both
    the street facade and the back wall of every recess — a balcony's glazed door is as
    much a window as the one beside it. Each run is snapped onto that wall line (the
    sheet draws glazing inside the wall thickness) and carries the outward direction, so
    the viewer does not have to guess which way the glass faces.
    """
    boundary = solid.boundary
    segs = []
    for x1, y1, x2, y2 in windows:
        ls = LineString([shift((x1, y1), off), shift((x2, y2), off)])
        if ls.length > 1e-6 and boundary.distance(ls.centroid) < FACADE_BAND_M:
            segs.append(ls)
    if not segs:
        return []
    merged = linemerge(unary_union(segs))
    lines = merged.geoms if isinstance(merged, MultiLineString) else [merged]
    runs = []
    for line in lines:
        pts = list(line.coords)
        start = 0
        for i in range(1, len(pts) - 1):
            ax, ay = pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]
            bx, by = pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]
            la = (ax * ax + ay * ay) ** 0.5 or 1
            lb = (bx * bx + by * by) ** 0.5 or 1
            # split the polyline wherever it turns a corner
            if (ax * bx + ay * by) / (la * lb) < 0.985:
                if LineString(pts[start : i + 1]).length >= MIN_RUN_M:
                    runs.append((pts[start], pts[i]))
                start = i
        if LineString(pts[start:]).length >= MIN_RUN_M:
            runs.append((pts[start], pts[-1]))

    out = []
    for a, b in runs:
        # snap both ends onto the wall the run belongs to
        pa = nearest_points(boundary, Point(a))[0]
        pb = nearest_points(boundary, Point(b))[0]
        ax, ay, bx, by = pa.x, pa.y, pb.x, pb.y
        dx, dy = bx - ax, by - ay
        length = (dx * dx + dy * dy) ** 0.5
        if length < MIN_RUN_M:
            continue
        # the normal that steps off the wall into open air (out of the solid)
        nx, ny = dy / length, -dx / length
        mx, my = (ax + bx) / 2, (ay + by) / 2
        if solid.contains(Point(mx + nx * 0.2, my + ny * 0.2)):
            nx, ny = -nx, -ny
        out.append([r2(ax), r2(ay), r2(bx), r2(by), r2(nx), r2(ny)])
    return out


def main():
    levels, block_parts = [], {}
    for lid, floor in LEVELS:
        plan = json.loads((PLANS / f"level-{lid}.3d.json").read_text(encoding="utf-8"))
        off = SHEET_TO_REFERENCE.get(lid, (0.0, 0.0))
        plates = [Polygon([shift(p, off) for p in ring]).buffer(0) for ring in plan.get("footprint", []) if len(ring) >= 3]
        plate = unary_union(plates)
        plate = max(plate.geoms, key=lambda g: g.area) if hasattr(plate, "geoms") else plate

        # The sheets draw balconies and terraces as rooms inside the floor plate. They are
        # open air, so they come out of the storey's solid: what is left is the wall line,
        # and the recess is what gives the facade its depth.
        open_air = []
        for room in plan.get("rooms", []):
            rr = room.get("ring")
            if not rr or len(rr) < 3 or not OPEN_AIR_ROOM.search(room.get("name", "")):
                continue
            poly = Polygon([shift(p, off) for p in rr]).buffer(0)
            if poly.area >= 2:
                open_air.append(poly)
        solid = plate
        if open_air:
            carved = plate.difference(unary_union(open_air).buffer(0.02))
            if not carved.is_empty:
                solid = max(carved.geoms, key=lambda g: g.area) if hasattr(carved, "geoms") else carved

        ring = ring_out(plate)
        if ring is None:
            continue
        # the balcony recesses, as holes in the storey above parapet height
        voids = []
        if solid.geom_type == "Polygon":
            for interior in solid.interiors:
                vp = Polygon(interior).buffer(0)
                if vp.area >= 2:
                    o = ring_out(vp, 0.15)
                    if o:
                        voids.append(o)
        entry = {
            "id": lid,
            "floor": floor,
            "ring": ring,
            # the slab edge stands a little proud of the wall: the shadow line that reads
            # as a storey from across the street
            "band": ring_out(plate.buffer(SLAB_OVERHANG_M, join_style=2), 0.3),
            "areaSqm": round(plate.area, 1),
            "windows": facade_runs(plan.get("windows", []), solid, off),
        }
        if voids:
            entry["voids"] = voids

        for kind, key in (("terrace", "terraces"), ("garden", "gardens")):
            outs = []
            for z in plan.get("zones", []):
                if z.get("kind") != kind or len(z.get("ring", [])) < 3:
                    continue
                p = Polygon([shift(pt, off) for pt in z["ring"]]).buffer(0)
                if p.area < 2:
                    continue
                o = ring_out(p, 0.2)
                if o:
                    outs.append(o)
            if outs:
                entry[key] = outs
        levels.append(entry)

        # block regions: the rooms the sheets assign to each residence, unioned per block
        for room in plan.get("rooms", []):
            code, rr = room.get("apartment"), room.get("ring")
            if not code or not rr or len(rr) < 3:
                continue
            letter = next((c for c in code.upper() if c in "ABC"), None)
            if letter:
                block_parts.setdefault(letter, []).append(Polygon([shift(p, off) for p in rr]).buffer(0.06))

    blocks = []
    for letter in "ABC":
        parts = block_parts.get(letter)
        if not parts:
            continue
        u = unary_union(parts)
        u = max(u.geoms, key=lambda g: g.area) if hasattr(u, "geoms") else u
        o = ring_out(u, 0.35)
        if not o:
            continue
        c = u.representative_point()
        blocks.append({"id": letter, "ring": o, "x": r2(c.x), "y": r2(c.y), "areaSqm": round(u.area, 1)})

    xs = [p[0] for lv in levels for p in lv["ring"]]
    ys = [p[1] for lv in levels for p in lv["ring"]]

    # Open ground: the parcel minus the building's own plate — the courtyard the blocks
    # wrap around, plus the setback to the street. Paving and planting go here.
    ground_plate = Polygon(levels[0]["ring"]).buffer(0)
    parcel = Polygon(
        [
            (min(xs) - PARCEL_MARGIN_M, min(ys) - PARCEL_MARGIN_M),
            (max(xs) + PARCEL_MARGIN_M, min(ys) - PARCEL_MARGIN_M),
            (max(xs) + PARCEL_MARGIN_M, max(ys) + PARCEL_MARGIN_M),
            (min(xs) - PARCEL_MARGIN_M, max(ys) + PARCEL_MARGIN_M),
        ]
    )
    open_space = parcel.difference(ground_plate.buffer(0.4))
    open_rings = []
    geoms = open_space.geoms if hasattr(open_space, "geoms") else [open_space]
    for g in geoms:
        if g.area < 20:
            continue
        o = ring_out(g, 0.4)
        if o:
            open_rings.append(o)
    out = {
        "units": "m",
        "note": "Footprints, facade glazing, terraces and gardens measured from the as-built sheets; storey heights are the viewer's assumption.",
        "bbox": [r2(min(xs)), r2(min(ys)), r2(max(xs)), r2(max(ys))],
        "center": [r2((min(xs) + max(xs)) / 2), r2((min(ys) + max(ys)) / 2)],
        "parcel": ring_out(parcel, 0.1),
        "open": open_rings,
        "levels": levels,
        "blocks": blocks,
    }
    path = PLANS / "massing.json"
    path.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)}  {path.stat().st_size / 1024:.0f} KB")
    for lv in levels:
        t = f" recesses={len(lv.get('voids', []))}" if lv.get("voids") else ""
        g = f" gardens={len(lv.get('gardens', []))}" if lv.get("gardens") else ""
        print(f"  level {lv['id']:>2}  ring={len(lv['ring']):3}  windows={len(lv['windows']):3}  area={lv['areaSqm']:7.1f}{t}{g}")
    print(f"  parcel {len(out['parcel'])} pts, open ground {len(open_rings)} area(s)")
    for b in blocks:
        print(f"  block {b['id']}  ring={len(b['ring']):3}  area={b['areaSqm']:7.1f}  anchor=({b['x']},{b['y']})")


if __name__ == "__main__":
    main()
