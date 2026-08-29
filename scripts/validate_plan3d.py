"""Validate web/public/plans/level-*.3d.json against the Plan3D contract (floorPlan3d.ts).

Besides the geometry checks, the residence footprints are checked against the registry in
web/src/data/buildingExplorer.ts: every apartments[] code (and every rooms[].apartment) must be
registered on that level, no code may be split into two detached footprints, measured areas
must be positive and consistent (rooms[].area matches its ring, a residence's rings never
overlap or nest, areaSqm / outdoorSqm cover the union of its rings, a complete residence adds
at most 15% of unlabelled floor), and a `complete` footprint must have a plausible area. A
coverage table (expected vs assigned codes, complete flags, unassigned rooms) is printed.

Usage:  python scripts/validate_plan3d.py [<plans_dir>] [levels]
Exit code 1 when any problem is found. Needs shapely (pip install shapely).
"""
from __future__ import annotations

import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

from shapely.geometry import Point, Polygon
from shapely.ops import unary_union

HERE = Path(__file__).resolve().parent
DEFAULT_PLANS = HERE.parent / "web" / "public" / "plans"
REGISTRY_TS = HERE.parent / "web" / "src" / "data" / "buildingExplorer.ts"
UNIT_LINE = re.compile(r"^\s*([ABC])\('([^']+)',\s*(?:'[^']*',\s*)?\[([^\]]*)\]")
FLOOR_OF_LEVEL = {"g": 0, **{str(i): i for i in range(1, 11)}}
MAX_BYTES = 400 * 1024
APT_SOURCES = {"tag", "inferred"}
COMPLETE_AREA = (80.0, 450.0)       # m² per level - a complete residence footprint outside this is a partition error
AREA_TOL = 0.15                     # m² - rooms[].area may not exceed the ring's own area by more than this
AREA_HOLE_SHARE = 0.2               # ... and may be below it by up to this share (wall islands inside the cell are not floor)
RING_OVERLAP_TOL = 0.5              # m² - rings of one residence (and of different residences) must not overlap / nest beyond this
UNLABELLED_SHARE_MAX = 0.15         # a complete residence's areaSqm may exceed the union of its labelled rings by at most this share
FOOTPRINT_LINK = 1.0                # m - rings of one residence must connect when grown by this (walls, glazing)
COMMON_ROOM = re.compile(r"lobby|\blifts?\b|elevator|technical|void over|planter|retail|management|parking entrance|^(east|west|building( [abc])?)$", re.IGNORECASE)


def load_registry() -> dict[int, list[str]]:
    """floor number -> registered residence codes (duplexes on both floors)."""
    by_floor: dict[int, list[str]] = defaultdict(list)
    try:
        text = REGISTRY_TS.read_text(encoding="utf-8")
    except Exception:
        return {}
    for line in text.splitlines():
        m = UNIT_LINE.match(line)
        if m:
            for f in re.findall(r"\d+", m.group(3)):
                by_floor[int(f)].append(m.group(2))
    return dict(by_floor)
FURN_KINDS = {"bed", "sofa", "table", "chair", "kitchen", "closet", "bath", "wc", "sink", "fridge", "oven", "plant", "generic"}
FLOORS = {"oak", "tile", "stone", "outdoor"}
WALL_KINDS = {"structural", "partition"}
APT_CODE = re.compile(r"^\d{1,2}(?:/\d{1,2})? (?:[AC]\d|B)$")
FOOTPRINT_RANGE = (800.0, 3200.0)   # m² per level - the plate is ~1500 m² (basements ~2400-2700)
ROOM_AREA = (1.2, 450.0)            # an open-plan residence cell may exceed the 150 m² corridor-chain cut-off
ZONE_KINDS = {"parking", "ramp", "water", "garden", "terrace", "plant"}
# parking aprons are > 60 m² parts cut into hole-free pieces, so a piece may be small
ZONE_AREA = {"parking": (0.5, 3000.0), "ramp": (12.0, 200.0), "water": (2.0, 200.0), "garden": (1.0, 600.0),
             "terrace": (1.2, 150.0), "plant": (0.3, 80.0)}
PARKING_TOTAL_MIN = 60.0
BAY_SHORT = (1.5, 3.2)              # m - a parking bay / car outline
BAY_LONG = (3.8, 6.5)
COLUMN_MAX = 2.0                    # m - column sides
CAPACITY_RANGE = (1, 200)


def is_num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def check_ring(ring, what: str, problems: list[str], min_area: float = 0.0):
    if not isinstance(ring, list) or len(ring) < 3:
        problems.append(f"{what}: ring needs >= 3 points")
        return None
    for p in ring:
        if not (isinstance(p, list) and len(p) == 2 and is_num(p[0]) and is_num(p[1])):
            problems.append(f"{what}: bad point {p!r}")
            return None
    if ring[0] == ring[-1]:
        problems.append(f"{what}: ring repeats its first point")
    poly = Polygon(ring)
    if not poly.is_valid:
        problems.append(f"{what}: invalid polygon ({poly.area:.2f} m2)")
    if poly.area < min_area:
        problems.append(f"{what}: area {poly.area:.2f} m2 below {min_area}")
    return poly


def check_seg(s, what: str, problems: list[str]):
    if not (isinstance(s, list) and len(s) == 4 and all(is_num(v) for v in s)):
        problems.append(f"{what}: bad segment {s!r}")
        return
    if math.hypot(s[2] - s[0], s[3] - s[1]) <= 0:
        problems.append(f"{what}: zero-length segment")


def validate(path: Path, registry: dict[int, list[str]] | None = None) -> tuple[list[str], dict]:
    problems: list[str] = []
    registry = registry if registry is not None else load_registry()
    size = path.stat().st_size
    if size > MAX_BYTES:
        problems.append(f"file is {size // 1024} KB (> {MAX_BYTES // 1024} KB)")
    plan = json.loads(path.read_text(encoding="utf-8"))
    level = plan.get("level")
    if not isinstance(level, str) or path.stem != f"level-{level}.3d":
        problems.append(f"level id {level!r} does not match file name")
    if plan.get("units") != "m":
        problems.append("units must be 'm'")
    for key in ("footprint", "wallPolys", "wallLines", "windows", "doors", "furniture", "stairs", "rooms", "shafts", "trees"):
        if not isinstance(plan.get(key), list):
            problems.append(f"{key} missing or not a list")
    if problems:
        return problems, {}
    bbox = plan.get("bbox")
    if not (isinstance(bbox, list) and len(bbox) == 4 and all(is_num(v) for v in bbox) and bbox[0] < bbox[2] and bbox[1] < bbox[3]):
        problems.append(f"bad bbox {bbox!r}")
    bx = Polygon([(bbox[0], bbox[1]), (bbox[2], bbox[1]), (bbox[2], bbox[3]), (bbox[0], bbox[3])]).buffer(0.01) if not problems else None

    plates = []
    for i, ring in enumerate(plan["footprint"]):
        poly = check_ring(ring, f"footprint[{i}]", problems, min_area=25)
        if poly is not None:
            plates.append(poly)
            if bx is not None and not bx.contains(poly):
                problems.append(f"footprint[{i}] exceeds bbox")
    fp_area = sum(p.area for p in plates)
    if not plates:
        problems.append("no footprint ring")
    elif not (FOOTPRINT_RANGE[0] <= fp_area <= FOOTPRINT_RANGE[1]):
        problems.append(f"footprint area {fp_area:.0f} m2 outside {FOOTPRINT_RANGE}")

    for i, wp in enumerate(plan["wallPolys"]):
        if wp.get("kind") not in WALL_KINDS:
            problems.append(f"wallPolys[{i}]: kind {wp.get('kind')!r}")
        check_ring(wp.get("ring"), f"wallPolys[{i}]", problems)
        for j, h in enumerate(wp.get("holes", [])):
            check_ring(h, f"wallPolys[{i}].holes[{j}]", problems)
    for key in ("wallLines", "windows", "stairs"):
        for i, s in enumerate(plan[key]):
            check_seg(s, f"{key}[{i}]", problems)
    for i, d in enumerate(plan["doors"]):
        if not (is_num(d.get("x")) and is_num(d.get("y")) and is_num(d.get("rot")) and is_num(d.get("width"))):
            problems.append(f"doors[{i}]: bad fields {d!r}")
            continue
        if not (0 <= d["rot"] < 360):
            problems.append(f"doors[{i}]: rot {d['rot']} not in [0, 360)")
        if not (0.4 <= d["width"] <= 3.0):
            problems.append(f"doors[{i}]: width {d['width']}")
    for i, f in enumerate(plan["furniture"]):
        b = f.get("box")
        if not (isinstance(b, list) and len(b) == 4 and all(is_num(v) for v in b) and b[0] < b[2] and b[1] < b[3]):
            problems.append(f"furniture[{i}]: bad box {b!r}")
        if f.get("kind") not in FURN_KINDS:
            problems.append(f"furniture[{i}]: kind {f.get('kind')!r}")
        if not (is_num(f.get("height")) and 0 < f["height"] <= 3):
            problems.append(f"furniture[{i}]: height {f.get('height')!r}")
        if "rot" in f and not is_num(f["rot"]):
            problems.append(f"furniture[{i}]: rot {f['rot']!r}")
    for i, s in enumerate(plan["shafts"]):
        check_ring(s, f"shafts[{i}]", problems)
    for i, t in enumerate(plan["trees"]):
        if not (is_num(t.get("x")) and is_num(t.get("y")) and is_num(t.get("r")) and t["r"] > 0):
            problems.append(f"trees[{i}]: bad fields {t!r}")

    basement = isinstance(level, str) and level.startswith("b")
    floor = FLOOR_OF_LEVEL.get(level) if isinstance(level, str) else None
    # residential levels: the registry's residences for that floor; basements: any registered
    # residence may be tagged (storage / bay allocations), counts are not bounded
    all_codes = {c for codes_ in registry.values() for c in codes_}
    expected = list(registry.get(floor, [])) if floor is not None else sorted(all_codes)

    apartments = plan.get("apartments", [])
    codes = set()
    if not isinstance(apartments, list):
        problems.append("apartments is not a list")
        apartments = []
    if floor is not None and len(apartments) > len(expected):
        problems.append(f"{len(apartments)} apartments but the registry places {len(expected)} residences on this level")
    for i, a in enumerate(apartments):
        code = a.get("code")
        if not (isinstance(code, str) and APT_CODE.match(code)):
            problems.append(f"apartments[{i}]: code {code!r} is not a registered-form code")
        elif floor is not None and code not in expected:
            problems.append(f"apartments[{i}]: {code!r} is not registered on this level (expected {expected})")
        if a.get("block") not in ("A", "B", "C") or (isinstance(code, str) and code[-1:] != a.get("block") and code[-2:-1] != a.get("block")):
            problems.append(f"apartments[{i}]: block {a.get('block')!r} disagrees with code {code!r}")
        if not (is_num(a.get("x")) and is_num(a.get("y"))):
            problems.append(f"apartments[{i}]: bad position")
        elif plates and not any(p.buffer(2.0).contains(Point(a["x"], a["y"])) for p in plates):
            # a tag drawn in an unenclosed wing (the open terrace level) may sit just off the plate
            problems.append(f"apartments[{i}] {code}: pin more than 2 m outside the footprint")
        if code in codes:
            problems.append(f"apartments[{i}]: duplicate code {code!r}")
        codes.add(code)
        if "rooms" in a and not (isinstance(a["rooms"], int) and not isinstance(a["rooms"], bool) and a["rooms"] >= 0):
            problems.append(f"apartments[{i}] {code}: rooms {a['rooms']!r}")
        for key in ("areaSqm", "outdoorSqm"):
            if key in a and not (is_num(a[key]) and a[key] > 0):
                problems.append(f"apartments[{i}] {code}: {key} {a[key]!r} is not a positive number")
        if "source" in a and a["source"] not in APT_SOURCES:
            problems.append(f"apartments[{i}] {code}: source {a['source']!r}")
        if "complete" in a and not isinstance(a["complete"], bool):
            problems.append(f"apartments[{i}] {code}: complete {a['complete']!r}")
        if a.get("complete"):
            if not a.get("rooms"):
                problems.append(f"apartments[{i}] {code}: complete without rooms")
            area = a.get("areaSqm")
            if not is_num(area) or not (COMPLETE_AREA[0] <= area <= COMPLETE_AREA[1]):
                problems.append(f"apartments[{i}] {code}: complete but areaSqm {area!r} outside {COMPLETE_AREA}")

    rings = 0
    seen_labels = set()
    rooms_by_code: dict[str, list[dict]] = defaultdict(list)
    ring_by_code: dict[str, list] = defaultdict(list)
    unassigned_rooms = 0
    for i, r in enumerate(plan["rooms"]):
        name = r.get("name")
        if not (isinstance(name, str) and name.strip()):
            problems.append(f"rooms[{i}]: empty name")
        if not (is_num(r.get("x")) and is_num(r.get("y"))):
            problems.append(f"rooms[{i}]: bad position")
            continue
        if "floor" in r and r["floor"] not in FLOORS:
            problems.append(f"rooms[{i}]: floor {r['floor']!r}")
        if "apartment" in r and r["apartment"] not in codes:
            problems.append(f"rooms[{i}]: apartment {r['apartment']!r} not in apartments[]")
        if "area" in r and not (is_num(r["area"]) and r["area"] > 0):
            problems.append(f"rooms[{i}] {name!r}: area {r['area']!r} is not a positive number")
        if "area" in r and "ring" not in r:
            problems.append(f"rooms[{i}] {name!r}: area without ring")
        key = (name, round(r["x"], 1), round(r["y"], 1))
        if key in seen_labels:
            problems.append(f"rooms[{i}]: duplicate label {key}")
        seen_labels.add(key)
        if "ring" in r:
            poly = check_ring(r["ring"], f"rooms[{i}] {name!r}", problems)
            if poly is None:
                continue
            rings += 1
            if not (ROOM_AREA[0] - 0.05 <= poly.area <= ROOM_AREA[1] + 0.05):
                problems.append(f"rooms[{i}] {name!r}: ring area {poly.area:.1f} m2 outside {ROOM_AREA}")
            if poly.distance(Point(r["x"], r["y"])) > 0.65:
                problems.append(f"rooms[{i}] {name!r}: label {poly.distance(Point(r['x'], r['y'])):.2f} m from its ring")
            if plates and not any(p.buffer(0.05).contains(poly) for p in plates):
                problems.append(f"rooms[{i}] {name!r}: ring not inside the footprint")
            if "area" in r and is_num(r["area"]) and not (poly.area * (1 - AREA_HOLE_SHARE) - AREA_TOL <= r["area"] <= poly.area + AREA_TOL):
                problems.append(f"rooms[{i}] {name!r}: area {r['area']} disagrees with the ring ({poly.area:.1f} m2)")
            if "apartment" in r:
                rooms_by_code[r["apartment"]].append(r)
                ring_by_code[r["apartment"]].append(poly)
                for a in apartments:
                    if (floor is not None and a.get("code") != r["apartment"] and is_num(a.get("x")) and is_num(a.get("y"))
                            and poly.contains(Point(a["x"], a["y"]))):
                        problems.append(f"rooms[{i}] {name!r} ({r['apartment']}): contains the pin of {a['code']}")
            elif not COMMON_ROOM.search(name or "") and r.get("floor") != "outdoor":
                unassigned_rooms += 1
        elif "apartment" in r:
            problems.append(f"rooms[{i}] {name!r}: apartment without ring")

    # ---- residence footprints: one connected footprint per code, areas consistent with its rooms
    # (residential levels only; basement tags mark storage rooms and bays, not footprints)
    for a in apartments if floor is not None else []:
        code = a.get("code")
        polys = ring_by_code.get(code, [])
        # a complete footprint is one connected set of rooms; a partial one may have unlabelled
        # cells (corridors) between its labelled rooms, which are not in rooms[]
        if a.get("complete") and len(polys) >= 2:
            grown = unary_union([p.buffer(FOOTPRINT_LINK) for p in polys])
            if grown.geom_type != "Polygon":
                parts = sorted((g.area for g in grown.geoms), reverse=True)
                problems.append(f"apartment {code}: rings form {len(parts)} detached footprints ({[round(v) for v in parts[:4]]} m2 grown)")
        # rings of one residence must not overlap or nest (a two-word label split into two rooms
        # holding the same cell, an outer ring drawn around an inner room): the union is the
        # floor, and areaSqm / outdoorSqm must cover it. A complete residence may add unlabelled
        # cells (corridors, closets) but only up to UNLABELLED_SHARE_MAX of its floor.
        for key, floor_kind in (("areaSqm", "indoor"), ("outdoorSqm", "outdoor")):
            polys_k = [p for r, p in zip(rooms_by_code.get(code, []), polys) if (r.get("floor") == "outdoor") == (floor_kind == "outdoor")]
            if not polys_k:
                continue
            union_k = unary_union(polys_k)
            overlap = sum(p.area for p in polys_k) - union_k.area
            if overlap > RING_OVERLAP_TOL:
                problems.append(f"apartment {code}: {floor_kind} rings overlap / nest by {overlap:.1f} m2 (sum {sum(p.area for p in polys_k):.1f}, union {union_k.area:.1f})")
            value = a.get(key)
            # the rings are exteriors; the totals exclude the wall islands (columns, planters,
            # enclosed closets) inside them, so the total may fall short of the union by that share
            if not is_num(value) or value + 0.1 < union_k.area * (1 - AREA_HOLE_SHARE):
                problems.append(f"apartment {code}: {key} {value!r} below the union of its {floor_kind} rings ({union_k.area:.1f} m2)")
            elif value > union_k.area + 0.1 and floor_kind == "outdoor":
                problems.append(f"apartment {code}: outdoorSqm {value} exceeds the union of its outdoor rings ({union_k.area:.1f} m2)")
            elif a.get("complete") and floor_kind == "indoor" and value > union_k.area / (1 - UNLABELLED_SHARE_MAX) + 0.5:
                problems.append(f"apartment {code}: complete but areaSqm {value} exceeds its labelled rings ({union_k.area:.1f} m2) by more than {UNLABELLED_SHARE_MAX:.0%}")
        if a.get("rooms") is not None and a["rooms"] != len(rooms_by_code.get(code, [])):
            problems.append(f"apartment {code}: rooms={a['rooms']} but {len(rooms_by_code.get(code, []))} rooms carry the code")
    # rings of different residences must not overlap either
    if floor is not None:
        coded = [(c, p) for c, ps in ring_by_code.items() for p in ps]
        for x in range(len(coded)):
            for y in range(x + 1, len(coded)):
                if coded[x][0] != coded[y][0] and coded[x][1].intersects(coded[y][1]):
                    ov = coded[x][1].intersection(coded[y][1]).area
                    if ov > RING_OVERLAP_TOL:
                        problems.append(f"rings of {coded[x][0]} and {coded[y][0]} overlap by {ov:.1f} m2")
    coverage = {
        "expected": expected if floor is not None else [],
        "assigned": {a.get("code"): {"source": a.get("source"), "complete": bool(a.get("complete")), "rooms": a.get("rooms", 0),
                                     "areaSqm": a.get("areaSqm"), "outdoorSqm": a.get("outdoorSqm")} for a in apartments},
        "missing": [c for c in expected if c not in codes],
        "unassignedRooms": unassigned_rooms,
    }

    # ---- realism fields (all optional)
    zones = plan.get("zones", [])
    if not isinstance(zones, list):
        problems.append("zones is not a list")
        zones = []
    zone_count = {}
    parking_total = 0.0
    for i, z in enumerate(zones):
        kind = z.get("kind")
        if kind not in ZONE_KINDS:
            problems.append(f"zones[{i}]: kind {kind!r}")
            continue
        zone_count[kind] = zone_count.get(kind, 0) + 1
        if "label" in z and not (isinstance(z["label"], str) and z["label"].strip()):
            problems.append(f"zones[{i}] {kind}: empty label")
        poly = check_ring(z.get("ring"), f"zones[{i}] {kind}", problems)
        if poly is None:
            continue
        lo, hi = ZONE_AREA[kind]
        if not (lo - 0.05 <= poly.area <= hi + 0.05):
            problems.append(f"zones[{i}] {kind}: area {poly.area:.1f} m2 outside {(lo, hi)}")
        if bx is not None and not bx.contains(poly):
            problems.append(f"zones[{i}] {kind}: ring exceeds bbox")
        if kind == "parking":
            parking_total += poly.area
            if not basement:
                problems.append(f"zones[{i}]: parking zone on a non-basement level")
    if zone_count.get("parking") and parking_total < PARKING_TOTAL_MIN:
        problems.append(f"parking zones total {parking_total:.0f} m2 below {PARKING_TOTAL_MIN}")
    if basement and plan.get("bays") and not zone_count.get("parking"):
        problems.append("bays without a parking zone")

    bays = plan.get("bays", [])
    if not isinstance(bays, list):
        problems.append("bays is not a list")
        bays = []
    if bays and not basement:
        problems.append("bays on a non-basement level")
    labelled = 0
    for i, b in enumerate(bays):
        box = b.get("box")
        if not (isinstance(box, list) and len(box) == 4 and all(is_num(v) for v in box) and box[0] < box[2] and box[1] < box[3]):
            problems.append(f"bays[{i}]: bad box {box!r}")
            continue
        w, h = box[2] - box[0], box[3] - box[1]
        short, long_ = min(w, h), max(w, h)
        if not (BAY_SHORT[0] <= short <= BAY_SHORT[1] and BAY_LONG[0] <= long_ <= BAY_LONG[1]):
            problems.append(f"bays[{i}]: size {short:.2f} x {long_:.2f} m is not a parking bay")
        if "rot" in b and not is_num(b["rot"]):
            problems.append(f"bays[{i}]: rot {b['rot']!r}")
        if "label" in b:
            if not (isinstance(b["label"], str) and b["label"].strip()):
                problems.append(f"bays[{i}]: empty label")
            else:
                labelled += 1
        if bx is not None and not bx.contains(Polygon([(box[0], box[1]), (box[2], box[1]), (box[2], box[3]), (box[0], box[3])])):
            problems.append(f"bays[{i}]: box exceeds bbox")
    if basement:
        # bays must have left the furniture list
        for i, f in enumerate(plan["furniture"]):
            box = f.get("box")
            if isinstance(box, list) and len(box) == 4 and all(is_num(v) for v in box) and f.get("kind") == "generic":
                w, h = box[2] - box[0], box[3] - box[1]
                if 1.6 <= min(w, h) <= 2.9 and 4.0 <= max(w, h) <= 5.8:
                    problems.append(f"furniture[{i}]: bay-sized generic outline still in furniture")

    capacity = plan.get("parkingCapacity")
    if capacity is not None:
        if not (isinstance(capacity, int) and not isinstance(capacity, bool) and CAPACITY_RANGE[0] <= capacity <= CAPACITY_RANGE[1]):
            problems.append(f"parkingCapacity {capacity!r} is not a plausible integer")
        if not basement:
            problems.append("parkingCapacity on a non-basement level")

    columns = plan.get("columns", [])
    if not isinstance(columns, list):
        problems.append("columns is not a list")
        columns = []
    for i, c in enumerate(columns):
        if not (is_num(c.get("x")) and is_num(c.get("y")) and is_num(c.get("w")) and is_num(c.get("d"))):
            problems.append(f"columns[{i}]: bad fields {c!r}")
            continue
        if not (0 < c["w"] <= COLUMN_MAX and 0 < c["d"] <= COLUMN_MAX):
            problems.append(f"columns[{i}]: size {c['w']} x {c['d']}")
        if "round" in c and not isinstance(c["round"], bool):
            problems.append(f"columns[{i}]: round {c['round']!r}")
        if bx is not None and not bx.contains(Point(c["x"], c["y"])):
            problems.append(f"columns[{i}]: outside bbox")
    # small axis-aligned structural rings should have become columns
    for i, wp in enumerate(plan["wallPolys"]):
        ring = wp.get("ring")
        if wp.get("kind") != "structural" or wp.get("holes") or not isinstance(ring, list) or len(ring) < 3:
            continue
        try:
            poly = Polygon(ring)
        except Exception:
            continue
        if not poly.is_valid:
            continue
        x0, y0, x1, y1 = poly.bounds
        w, d = x1 - x0, y1 - y0
        if w <= 1.3 and d <= 1.3 and poly.area <= 1.5 and min(w, d) >= 0.15 and poly.area >= 0.7 * w * d:
            problems.append(f"wallPolys[{i}]: column-sized structural ring ({w:.2f} x {d:.2f} m) not emitted as a column")

    stats = {"bytes": size, "footprint_m2": round(fp_area, 1), "rooms": len(plan["rooms"]), "rings": rings, "apartments": len(apartments),
             "zones": zone_count, "bays": f"{len(bays)} ({labelled} labelled)", "capacity": capacity, "columns": len(columns),
             "coverage": coverage}
    return problems, stats


def coverage_table(rows: list[tuple[str, dict]]) -> str:
    """Per-level residence coverage: expected codes vs assigned (source / complete / rooms / areas)."""
    lines = [f"{'level':>5}  {'expected':>8}  {'assigned':>8}  {'complete':>8}  {'unassigned rooms':>16}  codes"]
    for level, cov in rows:
        if not cov or not cov["expected"]:
            continue
        cells = []
        for code in cov["expected"]:
            a = cov["assigned"].get(code)
            if a is None:
                cells.append(f"{code}: MISSING")
                continue
            area = f"{a['areaSqm']:.0f}" if is_num(a["areaSqm"]) else "-"
            out = f"+{a['outdoorSqm']:.0f}" if is_num(a["outdoorSqm"]) else ""
            cells.append(f"{code}: {a['source'] or '?'}/{'complete' if a['complete'] else 'partial'} {a['rooms']}r {area}{out}")
        n_complete = sum(1 for a in cov["assigned"].values() if a["complete"])
        lines.append(f"{level:>5}  {len(cov['expected']):>8}  {len(cov['assigned']):>8}  {n_complete:>8}  {cov['unassignedRooms']:>16}  " + " | ".join(cells))
    return "\n".join(lines)


def main() -> None:
    plans_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PLANS
    only = set(sys.argv[2].split(",")) if len(sys.argv) > 2 else None
    registry = load_registry()
    if not registry:
        print(f"WARNING: no registry read from {REGISTRY_TS}; residence checks are skipped")
    total = 0
    rows = []
    for path in sorted(plans_dir.glob("level-*.3d.json")):
        level = path.stem[len("level-"):-len(".3d")]
        if only is not None and level not in only:
            continue
        problems, stats = validate(path, registry)
        total += len(problems)
        cov = stats.pop("coverage", None)
        rows.append((level, cov))
        print(f"level-{level:>2}: {len(problems)} problems  {stats}")
        for p in problems[:40]:
            print(f"    - {p}")
        if len(problems) > 40:
            print(f"    ... {len(problems) - 40} more")
    print("\nResidence coverage (areaSqm is net internal, measured from the as-built rooms; +n = outdoor):")
    print(coverage_table(rows))
    print(f"\nTOTAL problems: {total}")
    sys.exit(1 if total else 0)


if __name__ == "__main__":
    main()
