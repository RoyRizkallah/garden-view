"""Extract 3D-ready floor-plan geometry from the as-built DXF sheets.

Reads the DWG->DXF conversions (see render_plans.py for the ODA converter step) and
writes one compact JSON per level to web/public/plans/level-<id>.3d.json following the
contract in web/src/data/floorPlan3d.ts:

  { level, units:"m", bbox, footprint: Ring[], wallPolys: {ring, holes?, kind}[],
    wallLines: Seg[], windows: Seg[], doors: {x,y,rot,width}[],
    furniture: {box, rot?, kind, height}[], stairs: Seg[],
    rooms: {name, x, y, ring?, floor?, apartment?, area?}[],
    apartments?: {code, block, x, y, rooms?, areaSqm?, outdoorSqm?, complete?, source?}[],
    shafts: Ring[], trees: {x,y,r}[],
    zones?: {kind, ring, label?}[], bays?: {box, rot?, label?}[], parkingCapacity?: number,
    columns?: {x, y, w, d, round?}[] }

Rooms carry `ring` (the enclosed polygon, polygonised from the wall network), `floor`
(finish inferred from the room name), `area` (net internal m² measured from the ring - only
for rooms that own their whole cell; a Voronoi share of an open-plan cell gets none) and
`apartment` (the registered residence code the room belongs to). `apartments` lists the
residences the registry (buildingExplorer.ts) places on the level: found by their tag text
("3 A1", "APT 5/6 B1", source "tag") or inferred from the A-AREAS stack outlines and the door
graph (source "inferred"), with per-level room count, a `complete` flag that is true only when
the whole footprint is enclosed, labelled and assigned, and - for complete footprints only -
the measured indoor / outdoor area (see the "Apartment footprints" section). Levels without
registered residences (basements) keep the plain tag reading: storage / bay tags become pins
and tag their room; a drawn code is normalised to its registered form ("10 A2" -> "9/10 A2").

Realism fields (all derived from what the sheets actually draw, nothing is invented):
  bays      basement parking bays: the car-sized outlines on the furniture layers become
            bays (box + rot) labelled with the nearest A-PARK-TXT text ("9/10 C1", "POOL"
            -> "Shared") and leave the furniture list.
  parkingCapacity  the "CAR PARK (46 CARS)" note on the sheet.
  zones     parking (basement plate minus rooms/shafts/ramps/walls, parts > 60 m2), ramp
            (A-RAMP chevrons closed into a strip, labelled with the slope note "13M@20%"),
            water (SWIMMING POOL room ring; the "00 glass mirror water" cluster on Level 9),
            garden (PRIVATE GARDEN label -> enclosing polygon of the landscape block),
            terrace (TERRACE rooms with rings) and plant (PLANTER ring / A-TREES hatch /
            1.2 m disc around the label).
  columns   small free-standing structural hatch rings (<= 1.3 x 1.3 m, <= 1.5 m2) leave
            wallPolys and become columns (round when the ring is a near-circle); closed
            outlines and circles on COLUMN / A-struc layers are added as well.

Usage:  python scripts/extract_plan3d.py [<dxf_dir>] [<out_dir>] [levels]
        e.g. levels "3,4,g" to extract only some sheets.
Needs:  pip install ezdxf shapely   (Python 3.12, ezdxf 1.4, shapely 2.1)

Level ids and the model-space CROP windows are imported from render_plans.py so the
2D SVG and the 3D geometry always show the same region of each sheet.
"""
from __future__ import annotations

import json
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import ezdxf
import ezdxf.bbox
from ezdxf import path as ezpath
from ezdxf.math import Vec3, bulge_to_arc
import shapely
from shapely import affinity as shp_affinity
from shapely.geometry import LineString, MultiLineString, MultiPolygon, Point, Polygon, box as shp_box
from shapely.ops import unary_union
import shapely.ops

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
try:
    from render_plans import CROP, LEVEL_IDS  # single source of truth shared with the 2D renderer
except Exception:  # pragma: no cover - keep the extractor usable if the SVG deps are missing
    LEVEL_IDS = {
        "A101-BASEMENT-3": "b3", "A102-BASEMENT-2": "b2", "A103-BASEMENT-1": "b1",
        "A104-Ground floor": "g", "A105-floor1": "1", "A106-Floor2": "2", "A107-Floor3": "3",
        "A108-Floor4": "4", "A109-Floor5": "5", "A108-Floor6": "6", "A209-Floor7": "7",
        "A112-Floor8": "8", "A113-Floor9": "9", "A114-Floor10": "10",
    }
    CROP = {"3": (-5.0, -25.0, 50.0, 65.0), "4": (-5.0, -8.0, 50.0, 65.0), "g": (-12.0, -18.0, 58.0, 78.0)}

DEFAULT_DXF_DIR = Path(r"C:\Users\User\AppData\Local\Temp\claude\c--garden-view\cfe74454-8da8-4f54-ad6f-2d18c42bcd98\scratchpad\dxf")
DEFAULT_OUT_DIR = HERE.parent / "web" / "public" / "plans"
REGISTRY_TS = HERE.parent / "web" / "src" / "data" / "buildingExplorer.ts"

FLATTEN = 0.02          # max arc flattening error (m)
CLUSTER_TOL = 0.02      # furniture union-find endpoint tolerance (m)
MIN_RING_AREA = 0.02    # m² - smaller wall polygons are noise
ROUND = 3
TEXT_CROP_PAD = 30.0    # room labels may sit this far outside the crop if their room part is inside
ROOM_MIN_AREA = 1.2     # m² - polygonised parts smaller than this are wall pockets, not rooms
ROOM_MAX_AREA = 150.0   # m² - larger parts are corridor-like unions (open door chains) and get no ring
ROOM_RING_SIMPLIFY = 0.03
LABEL_SNAP = 0.6        # a label on a wall snaps to the nearest room part within this distance
DUP_LABEL_DIST = 6.0    # m - same-name labels in one multi-label cell farther apart than this are two rooms
NECK_WIDTH = 0.15       # m - cells joined through a slit thinner than this are separate cells (a door is >= 0.6 m)
SMALL_ROOM_MAX_AREA = 40.0   # m² - a closet / bath / storage label alone in a cell above this does not name the cell
SINGLE_ROOM_MAX_AREA = 80.0  # m² - an indoor cell above this under one label gets a ring but no per-room area
SMALL_ROOM_NAME = re.compile(r"stor|closet|dress|wardrobe|linen|laundry|pantry|\bwc\b|toilet|bath|shower|maid", re.IGNORECASE)
PLATE_INSET = 0.15      # the closed plate overshoots the outer walls by ~0.1 m; inset it so no
                        # exterior rim links balconies and window openings into one union
# realism fields
BAY_SHORT = (1.6, 2.9)      # m - a parking bay / car outline on the basement furniture layers
BAY_LONG = (4.0, 5.8)
BAY_LABEL_DIST = 1.8        # m - an A-PARK-TXT label belongs to the bay whose centre is this close
BAY_LABEL_INSIDE = 0.25     # m - ... or whose outline (buffered this much) contains the label
COLUMN_MAX_SIDE = 1.3       # m - structural rings up to this bbox and area are columns
COLUMN_MAX_AREA = 1.5
COLUMN_MIN_SIDE = 0.15      # thinner rings are wall stubs / lintels, not columns
COLUMN_BOXINESS = 0.7       # area / bbox area - rotated rectangles stay wall polygons
RAMP_AREA = (12.0, 200.0)   # m2 - closed parts of the A-RAMP linework that are a ramp
RAMP_LINE_BUFFER = 0.08
RAMP_CLOSE = 0.6            # m - chevron / ladder slices are merged by a morphological closing
RAMP_LABEL_DIST = 2.5       # m - slope notes ("13M@20%") this close to the ramp label it
PARKING_MIN_AREA = 60.0     # m2 - plate parts (minus rooms, shafts, ramps, walls) kept as car park
GARDEN_AREA = (10.0, 600.0) # m2 - landscape polygons that may enclose a PRIVATE GARDEN label
GARDEN_TREES_DIST = 4.0     # m - fallback: A-TREES cluster this close to the label, buffered 1.0
PLANTER_AREA = (0.3, 80.0)  # m2 - A-TREES hatches that may be a PLANTER
PLANTER_DIST = 1.5
PLANTER_RADIUS = 1.2        # m - disc around a PLANTER label with no ring / hatch
WATER_FEATURE_AREA = (2.0, 200.0)
ZONE_SIMPLIFY = 0.05

# ---------------------------------------------------------------------------------------
# Layer classification. Layer names vary per sheet; everything is matched case-insensitively
# on a normalised name (xref-bound "PREFIX$0$NAME" layers are reduced to NAME unless the
# prefix marks an unrelated set - structural notes, the SMB interior set, ID furniture xrefs).
# The Floor-5 sheet draws its NW wing (apartment 5 A1) only inside the bound xref
# "9-48-Xref plan"; that xref is an in-place plan and is therefore kept.
# ---------------------------------------------------------------------------------------
SKIP_XREF_PREFIXES = ("S-", "SMB", "ID-", "AXIS", "PARCELLE")
# A-AREAS (the architect's area-schedule outlines) is skipped as linework but its closed outlines are
# read separately as residence footprints (see OUTLINE_LAYER); A-AREAS-TXT stays skipped (row numbers).
SKIP_LAYER_PREFIXES = ("smb", "s-", "defpoints", "axis", "a-anno-levl", "a-anno-dim", "a-anno-tx", "a-dim", "a-areas", "a-park", "a-stor")
OUTLINE_LAYER = "A-AREAS"
# text on these layers is never a room label nor an apartment tag (dimension strings, the SMB set)
SKIP_TEXT_PREFIXES = ("smb", "s-", "defpoints", "axis", "a-anno-dim", "a-dim", "a-anno-tx", "a-anno-levl", "a-areas", "id-", "parcelle")
WALL_LINE_LAYERS = {"a-wall", "a-plaster", "00 wall", "walls", "wall-rdc-1er", "a-struc", "a-conc", "con01-struct", "con02-non-struct"}
STAIR_LAYERS = {"a-flor-strs", "a-stair", "00 stairs"}
DOOR_LAYERS = {"a-doors", "a-porte", "a-door", "00 doors", "ar19-doors"}
TREE_LAYERS = {"a-trees", "a-tree"}
SHAFT_LAYERS = {"a-shaft"}
FURN_LAYER_TOKENS = ("furn", "kitchen", "closet", "flor-pfix", "proj-til-bath", "sanit", "fur2")
ROOM_LAYER_TOKENS = ("nomenclature", "room", "idtag")
RAMP_LAYERS = {"a-ramp"}
LANDSCAPE_LAYERS = {"a-landscaping", "a-landscape"}
COLUMN_LAYER_TOKENS = ("colum",)            # closed outlines / circles here are columns
COLUMN_CIRCLE_LAYER_TOKENS = ("struc", "colum", "a-conc")
WATER_LINE_LAYERS = {"00 glass mirror water"}  # reflecting-pool linework (Level 9 terrace)
PARK_TXT_LAYER = "A-PARK-TXT"               # bay labels (apartment codes, POOL, EXTRA, HANDICAP)
CAPACITY_RX = re.compile(r"CAR\s*PARK\s*\((\d+)\s*CARS?\)", re.IGNORECASE)
SLOPE_RX = re.compile(r"\b(\d+(?:[.,]\d+)?)\s*M\s*@\s*(\d+(?:[.,]\d+)?)\s*%", re.IGNORECASE)
WATER_ROOM = re.compile(r"swimming|^pool$", re.IGNORECASE)
GARDEN_ROOM = re.compile(r"^private garden$", re.IGNORECASE)
TERRACE_ROOM = re.compile(r"^terrace$", re.IGNORECASE)
PLANTER_ROOM = re.compile(r"^planter$", re.IGNORECASE)
BAY_EXTRA = re.compile(r"^extra\s*\((.+)\)$", re.IGNORECASE)
NOTE_LAYER_PREFIX = "a-text"   # red site notes ("PRIVATE GARDEN", "PLANTER") - room labels only when they name a room
ENVELOPE_TOKENS = ("balu", "blst")

ROOM_WORDS = re.compile(
    r"\b(bed ?room|living|dining|kitchen|bath|bathroom|wc|toilet|entrance|entry|lobby|terrace|balcony|maid|"
    r"guest|dressing|laundry|salon|garden|elevator|lift|stair|sas|technical|generator|transformer|water tank|"
    r"car ?park|parking|pool|reception|storage|store|lounge|family|office|study|hall|hallway|corridor|"
    r"electrical|pump|boiler|gym|spa|shaft|void|planter|foyer|pantry|library|playroom)\b",
    re.IGNORECASE,
)
ACRONYMS = {"WC", "SAS", "TV", "AC", "HVAC", "FM", "GF"}
DIM_TEXT = re.compile(r"^[\s\d.,+\-/x×%°'\"@#()]*$")
# apartment / drawing codes that sit on the nomenclature layer but are not room names ("3 A1", "I-502", "C 13")
ROOM_CODE = re.compile(r"[A-Za-z]?\s*-?\d+(\s*/\s*\d+)?\s*[A-Za-z]?\d?", re.IGNORECASE)
# residence tags as drawn: "3 A1", "0/1 B", "9/10 C2", "APT 2C1", "APT 5/6 B1", "APT9/10 A1".
# The block letter is upper-case on the sheets; lower-case "14b" is an area tag, not a residence.
APT_TAG = re.compile(r"^\s*(?:(?i:apts?\.?)\s*)?(\d{1,2}(?:\s*/\s*\d{1,2})?)\s*[-_]?\s*([ABC])\s*(\d?)\s*$")
# a room label that carries the residence code as a suffix ("ENTRANCE APT 7C1")
APT_SUFFIX = re.compile(r"\s*\b(?i:apts?\.?)\s*(\d{1,2}(?:\s*/\s*\d{1,2})?)\s*[-_]?\s*([ABC])\s*(\d?)\s*$")
# notes that mention a room word but describe something else
NOT_A_ROOM = re.compile(r"\d\s*(cm|mm|m)\b|height|\bfrom\b|\babove\b|\bbelow\b|by owner|=|huc|hu beam|access trap|limit of|^\d+(st|nd|rd|th)\b", re.IGNORECASE)

FLOOR_RULES = [
    ("tile", re.compile(r"bath|wc|toilet|kitchen|laundry|maid|shower|sas", re.IGNORECASE)),
    ("stone", re.compile(r"entrance|entry|lobby|hall|corridor|reception|elevator|stair", re.IGNORECASE)),
    ("outdoor", re.compile(r"balcon|terrace|garden|planter|void|roof", re.IGNORECASE)),
]

FURN_KIND_BY_NAME = [
    ("bathtub", "bath", 0.55), ("bath", "bath", 0.55), ("tub", "bath", 0.55), ("bac", "bath", 0.2),
    ("frigo", "fridge", 1.9), ("fridge", "fridge", 1.9), ("oven", "oven", 0.9), ("cooker", "oven", 0.9),
    ("sink", "sink", 0.85), ("lavabo", "sink", 0.85), ("basin", "sink", 0.85),
    ("wc", "wc", 0.4), ("toilet", "wc", 0.4), ("bidet", "wc", 0.4),
    ("bed", "bed", 0.55), ("sofa", "sofa", 0.8), ("couch", "sofa", 0.8), ("table", "table", 0.75),
    ("chair", "chair", 0.45), ("plant", "plant", 1.2),
]

FLOOR_OF_LEVEL = {"g": 0, **{str(i): i for i in range(1, 11)}}
DEBUG: dict = {}   # when non-empty after extract(): intermediate geometry for debugging plots


def norm_layer(name: str) -> str | None:
    """Return the normalised layer name, or None if the layer must be ignored entirely."""
    if "$0$" in name:
        prefix = name.split("$0$")[0].strip().upper()
        if not prefix or prefix.startswith(SKIP_XREF_PREFIXES):
            return None
        name = name.split("$0$")[-1]
    low = name.strip().lower()
    if low.startswith(SKIP_LAYER_PREFIXES):
        return None
    return low


def text_layer_ok(name: str) -> bool:
    """Whether TEXT/MTEXT on this raw layer may be a room label or an apartment tag."""
    if "$0$" in name:
        prefix = name.split("$0$")[0].strip().upper()
        if not prefix or prefix.startswith(SKIP_XREF_PREFIXES):
            return False
        name = name.split("$0$")[-1]
    return not name.strip().lower().startswith(SKIP_TEXT_PREFIXES)


def r3(v: float) -> float:
    return round(float(v) + 0.0, ROUND)


def seg(a, b) -> list[float]:
    return [r3(a[0]), r3(a[1]), r3(b[0]), r3(b[1])]


def ring_out(coords) -> list[list[float]]:
    pts = [[r3(x), r3(y)] for x, y in coords]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts.pop()
    return pts


def emit_rings(poly, tol: float = 0.0, min_area: float = 0.0) -> list:
    """Every hole-free piece of `poly` as a rounded, valid ring.

    Like emit_ring, but when simplification / rounding pinches the ring into a self-touching
    shape ALL repaired pieces above `min_area` are emitted, not only the largest: a car-park
    apron pinched to zero width by a duct room must not lose the half beyond the pinch.
    """
    out = []
    stack = [(poly, tol, 0)]
    while stack:
        g, t, depth = stack.pop()
        if g is None or g.is_empty:
            continue
        if g.geom_type != "Polygon":
            stack.extend((q, t, depth) for q in iter_polygons(g))
            continue
        p = g.simplify(t, preserve_topology=True) if t else g
        ring = ring_out(p.exterior.coords)
        if len(ring) < 3:
            continue
        test = Polygon(ring)
        if test.is_valid:
            if test.area >= min_area:
                out.append(ring)
            continue
        if depth >= 4:
            continue
        for q in iter_polygons(shapely.make_valid(test)):
            if q.area >= max(min_area, 1e-6):
                stack.append((Polygon(q.exterior.coords), 0.0, depth + 1))
    return out


def emit_ring(poly, tol: float = 0.0, min_area: float = 0.0):
    """Exterior ring of `poly` as rounded coordinates that still form a valid polygon.

    Simplification and 3-dp rounding can pinch a ring into a self-touching shape; when that
    happens the ring is repaired with make_valid and the largest piece is re-emitted.
    """
    for _attempt in range(4):
        if poly is None or poly.is_empty or poly.geom_type != "Polygon":
            return None
        p = poly.simplify(tol, preserve_topology=True) if tol else poly
        ring = ring_out(p.exterior.coords)
        if len(ring) < 3:
            return None
        test = Polygon(ring)
        if test.is_valid and test.area >= min_area:
            return ring
        fixed = shapely.make_valid(test)
        pieces = [g for g in iter_polygons(fixed) if g.area >= max(min_area, 1e-6)]
        if not pieces:
            return None
        poly = max(pieces, key=lambda g: g.area).buffer(0)
        if poly.geom_type != "Polygon":
            pieces = [g for g in iter_polygons(poly)]
            if not pieces:
                return None
            poly = max(pieces, key=lambda g: g.area)
        tol = 0.0
    return None


def apt_code(num: str, block: str, digit: str) -> str:
    """Normalise a drawn residence tag to the registered form: "3 A1", "5/6 B", "9/10 C2".

    Block B is one full-floor residence per level and is registered without a stack digit
    ("5/6 B"); the sheets sometimes write it "B1". Blocks A/C always carry the stack digit.
    """
    num = re.sub(r"\s+", "", num)
    block = block.upper()
    # residential floors are 0..10; a slashed prefix is a duplex on two consecutive floors
    floors = [int(v) for v in num.split("/")]
    if not all(0 <= f <= 10 for f in floors) or (len(floors) == 2 and floors[1] != floors[0] + 1):
        return ""
    if block == "B":
        return canonical_code(f"{num} B")
    if not digit:
        return ""
    return canonical_code(f"{num} {block}{digit}")


_REGISTRY_CODES: set[str] | None = None
CODE_NORMALISED: dict[str, str] = {}   # drawn code -> registered code (reported in the notes)


def registered_codes() -> set[str]:
    global _REGISTRY_CODES
    if _REGISTRY_CODES is None:
        _REGISTRY_CODES = {c for codes in load_registry().values() for c in codes}
    return _REGISTRY_CODES


def canonical_code(code: str) -> str:
    """The registered form of a drawn code: a basement storage / bay tag "10 A2" names the only
    registered A2 residence that occupies floor 10 ("9/10 A2"). Ambiguous or unknown codes are
    returned unchanged (and surface as unregistered tags)."""
    codes = registered_codes()
    if not codes or code in codes:
        return code
    num, stack = code.split(" ", 1)
    floors = set(num.split("/"))
    cands = [c for c in codes if c.split(" ", 1)[1] == stack and floors <= set(c.split(" ", 1)[0].split("/"))]
    if len(cands) == 1:
        CODE_NORMALISED[code] = cands[0]
        return cands[0]
    return code


def floor_for(name: str) -> str:
    for kind, rx in FLOOR_RULES:
        if rx.search(name):
            return kind
    return "oak"


# ---------------------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------------------
def entity_polylines(e, scale: float = 1.0) -> list[tuple[list[tuple[float, float]], bool]]:
    """Flatten a curve entity to one or more (vertex list, closed) polylines in metres."""
    t = e.dxftype()
    if t == "HATCH":
        out = []
        for p in ezpath.from_hatch(e):
            pts = [(v.x * scale, v.y * scale) for v in p.flattening(FLATTEN / scale)]
            if len(pts) >= 2:
                out.append((pts, True))
        return out
    if t in ("LINE", "ARC", "CIRCLE", "ELLIPSE", "LWPOLYLINE", "POLYLINE", "SPLINE"):
        try:
            p = ezpath.make_path(e)
        except Exception:
            return []
        pts = [(v.x * scale, v.y * scale) for v in p.flattening(FLATTEN / scale)]
        if len(pts) < 2:
            return []
        closed = bool(p.is_closed) or t == "CIRCLE" or (t in ("LWPOLYLINE", "POLYLINE") and e.is_closed)
        return [(pts, closed)]
    return []


def polyline_segments(pts, closed: bool) -> list[list[float]]:
    segs = []
    n = len(pts)
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        a, b = pts[i], pts[(i + 1) % n]
        if math.hypot(b[0] - a[0], b[1] - a[1]) > 0.01:
            segs.append(seg(a, b))
    return segs


def valid_poly(pts) -> Polygon | None:
    if len(pts) < 3:
        return None
    try:
        poly = Polygon(pts)
        if not poly.is_valid:
            poly = shapely.make_valid(poly)
        if poly.is_empty:
            return None
        if poly.geom_type != "Polygon":
            polys = [g for g in getattr(poly, "geoms", []) if g.geom_type == "Polygon"]
            if not polys:
                return None
            poly = max(polys, key=lambda g: g.area) if len(polys) == 1 else unary_union(polys)
        return poly if poly.area >= 1e-6 else None
    except Exception:
        return None


def hatch_polygon(e, scale: float):
    """Even-odd combine of all boundary paths -> outer loops minus islands."""
    result = None
    for pts, _closed in entity_polylines(e, scale):
        poly = valid_poly(pts)
        if poly is None:
            continue
        result = poly if result is None else result.symmetric_difference(poly)
    if result is None or result.is_empty:
        return None
    return result


def iter_polygons(geom):
    if geom is None or geom.is_empty:
        return
    if geom.geom_type == "Polygon":
        yield geom
    elif hasattr(geom, "geoms"):
        for g in geom.geoms:
            yield from iter_polygons(g)


def segs_buffer(segs, dist: float):
    return MultiLineString([((s[0], s[1]), (s[2], s[3])) for s in segs]).buffer(dist, quad_segs=2)


def block_extents(doc, name: str, cache: dict):
    if name in cache:
        return cache[name]
    ext = None
    try:
        blk = doc.blocks.get(name)
        b = ezdxf.bbox.extents(blk, fast=True)
        if b.has_data:
            ext = (b.extmin.x, b.extmin.y, b.extmax.x, b.extmax.y)
    except Exception:
        ext = None
    cache[name] = ext
    return ext


def attribs_in_reading_order(doc, ins, scale: float, cache: dict) -> list:
    """The INSERT's attributes sorted top line first, then left to right.

    Uses the block definition's ATTDEF positions (the attribute list follows the ATTDEF order)
    so squashed or rotated copies read the same as the definition; falls back to the drawn
    attribute positions when the tag sequences disagree.
    """
    attribs = list(ins.attribs)
    key = ("__attdefs__", ins.dxf.name)
    if key not in cache:
        try:
            blk = doc.blocks.get(ins.dxf.name)
            cache[key] = [(a.dxf.tag, float(a.dxf.insert.x), float(a.dxf.insert.y)) for a in blk if a.dxftype() == "ATTDEF"]
        except Exception:
            cache[key] = []
    defs = cache[key]
    if len(defs) == len(attribs) and all(d[0] == a.dxf.tag for d, a in zip(defs, attribs)):
        order = sorted(range(len(attribs)), key=lambda i: (-round(defs[i][2], 3), defs[i][1]))
        return [attribs[i] for i in order]
    return sorted(attribs, key=lambda a: (-round(a.dxf.insert.y * scale, 2), a.dxf.insert.x))


def insert_box(ins, ext, scale: float):
    """World-space centre, (w, h) in the block's rotated frame, and rotation (deg)."""
    m = ins.matrix44()
    cx, cy = (ext[0] + ext[2]) / 2, (ext[1] + ext[3]) / 2
    c = m.transform(Vec3(cx, cy, 0))
    w = (ext[2] - ext[0]) * abs(ins.dxf.xscale) * scale
    h = (ext[3] - ext[1]) * abs(ins.dxf.yscale) * scale
    # rotation of the block x axis in world space (mirroring may flip it, the box is symmetric)
    d = m.transform_direction(Vec3(1, 0, 0))
    rot = math.degrees(math.atan2(d.y, d.x)) % 180.0
    if rot > 90:
        rot -= 180.0
    return (c.x * scale, c.y * scale), (w, h), rot


def title_case(s: str) -> str:
    words = []
    for w in s.split():
        if w.upper() in ACRONYMS:
            words.append(w.upper())
        elif re.fullmatch(r"[A-Z]\d*|\d+[A-Za-z]?|\d+/\d+", w):
            words.append(w.upper())
        else:
            words.append(w[:1].upper() + w[1:].lower())
    return " ".join(words)


def text_height(e, scale: float) -> float:
    """Text height of a TEXT/MTEXT entity in metres (0.25 when not set)."""
    try:
        h = e.dxf.height if e.dxftype() == "TEXT" else e.dxf.char_height
        return float(h or 0.25) * scale
    except Exception:
        return 0.25 * scale


def text_anchor(e, scale: float):
    """(clean text, centre x, centre y) of a TEXT/MTEXT entity in metres; None if empty."""
    if e.dxftype() == "TEXT":
        raw = e.dxf.text
        p = e.dxf.insert
        ap = e.dxf.get("align_point")
        if ap is not None and (e.dxf.halign != 0 or e.dxf.valign != 0):
            p = ap
        h = float(e.dxf.height or 0.25)
        x, y = p.x * scale, p.y * scale
        txt = re.sub(r"%%[a-z]", "", raw).strip()
        if e.dxf.halign == 0 and e.dxf.valign == 0:  # left/baseline -> shift to centre
            x += 0.5 * len(txt) * h * 0.75 * scale
            y += 0.5 * h * scale
    else:
        raw = e.text
        try:
            txt = e.plain_text()
        except Exception:
            txt = re.sub(r"\\[A-Za-z][^;]*;|[{}]", "", raw)
        txt = txt.replace("\\P", "\n")
        lines = [ln.strip() for ln in txt.splitlines() if ln.strip()]
        nlines = max(1, len(lines))
        txt = " ".join(lines)
        p = e.dxf.insert
        h = float(e.dxf.char_height or 0.25)
        x, y = p.x * scale, p.y * scale
        attach = int(e.dxf.attachment_point or 1)
        maxlen = max((len(ln) for ln in lines), default=0)
        col, row = (attach - 1) % 3, (attach - 1) // 3
        if col == 0:
            x += 0.5 * maxlen * h * 0.75 * scale
        elif col == 2:
            x -= 0.5 * maxlen * h * 0.75 * scale
        if row == 0:
            y -= 0.5 * nlines * h * 1.5 * scale
        elif row == 2:
            y += 0.5 * nlines * h * 1.5 * scale
    txt = re.sub(r"\s+", " ", txt).strip(" -_:.,")
    if not txt:
        return None
    return txt, x, y


# ---------------------------------------------------------------------------------------
# Furniture clustering (union-find on shared endpoints)
# ---------------------------------------------------------------------------------------
class UnionFind:
    def __init__(self, n):
        self.p = list(range(n))

    def find(self, i):
        while self.p[i] != i:
            self.p[i] = self.p[self.p[i]]
            i = self.p[i]
        return i

    def union(self, a, b):
        a, b = self.find(a), self.find(b)
        if a != b:
            self.p[b] = a


def cluster_items(items: list[dict]):
    """items: {'pts': [(x,y)...], 'segs': [((x,y),(x,y))...]} -> list of clusters (lists of items)."""
    uf = UnionFind(len(items))
    grid: dict[tuple[int, int], list[int]] = defaultdict(list)
    inv = 1.0 / CLUSTER_TOL
    for i, it in enumerate(items):
        for x, y in it["ends"]:
            gx, gy = int(math.floor(x * inv)), int(math.floor(y * inv))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for j in grid.get((gx + dx, gy + dy), ()):
                        uf.union(i, j)
            grid[(gx, gy)].append(i)
    groups: dict[int, list[dict]] = defaultdict(list)
    for i, it in enumerate(items):
        groups[uf.find(i)].append(it)
    return list(groups.values())


def dominant_angle(segs) -> float:
    """Length-weighted dominant direction folded to (-45, 45]; 0 if axis aligned enough.

    Uses the circular mean of 4*theta so the four sides of a rectangle reinforce each
    other while diagonals (car markers, closet crosses) only dilute the concentration.
    """
    sx = sy = total = 0.0
    for (x1, y1), (x2, y2) in segs:
        L = math.hypot(x2 - x1, y2 - y1)
        if L < 0.05:
            continue
        t4 = 4.0 * math.atan2(y2 - y1, x2 - x1)
        sx += L * math.cos(t4)
        sy += L * math.sin(t4)
        total += L
    if total == 0:
        return 0.0
    concentration = math.hypot(sx, sy) / total
    if concentration < 0.35:
        return 0.0
    ang = math.degrees(math.atan2(sy, sx)) / 4.0  # in (-45, 45]
    if abs(ang) < 2:
        return 0.0
    return round(ang, 1)


def oriented_box(pts, rot_deg: float):
    """Return ([xmin,ymin,xmax,ymax] centred box in rotated frame semantics, w, h)."""
    if rot_deg:
        t = math.radians(-rot_deg)
        c, s = math.cos(t), math.sin(t)
        rp = [(x * c - y * s, x * s + y * c) for x, y in pts]
    else:
        rp = pts
    xs = [p[0] for p in rp]
    ys = [p[1] for p in rp]
    xmin, xmax, ymin, ymax = min(xs), max(xs), min(ys), max(ys)
    cxr, cyr = (xmin + xmax) / 2, (ymin + ymax) / 2
    if rot_deg:
        t = math.radians(rot_deg)
        c, s = math.cos(t), math.sin(t)
        cx, cy = cxr * c - cyr * s, cxr * s + cyr * c
    else:
        cx, cy = cxr, cyr
    w, h = xmax - xmin, ymax - ymin
    return [r3(cx - w / 2), r3(cy - h / 2), r3(cx + w / 2), r3(cy + h / 2)], w, h


def classify_furniture(layer: str, name: str | None, w: float, h: float, level: str):
    lname = (name or "").lower()
    for token, kind, height in FURN_KIND_BY_NAME:
        if token in lname and (token != "bed" or "bedroom" not in lname):
            return kind, height
    long_, short = max(w, h), min(w, h)
    if "kitchen" in layer:
        return "kitchen", 0.9
    if "closet" in layer or "clos" in layer:
        return "closet", 2.2
    if "pfix" in layer or "sanit" in layer or "bath" in layer:
        if long_ >= 1.4:
            return "bath", 0.55
        if 0.6 <= long_ <= 1.0 and 0.3 <= short <= 0.55:
            return "wc", 0.4
        if 0.35 <= long_ <= 0.9 and 0.3 <= short <= 0.7:
            return "sink", 0.85
        return "generic", 0.7
    # generic furniture layers (AR25-FURN, A-FURNITURE, FUR2 ...)
    if level.startswith("b"):
        if 1.6 <= short <= 2.8 and 4.0 <= long_ <= 5.6:
            return "generic", 1.45  # parked car / parking bay
        return "generic", 0.7
    if short >= 1.4 and long_ >= 1.8:
        return "bed", 0.55
    if long_ >= 1.6 and 0.7 <= short <= 1.1:
        return "sofa", 0.8
    if 0.4 <= short <= 0.7 and long_ <= 0.75 and long_ / max(short, 1e-6) <= 1.4:
        return "chair", 0.45
    if 0.7 <= short <= 2.0 and long_ <= 2.0 and long_ / max(short, 1e-6) <= 1.6:
        return "table", 0.75
    return "generic", 0.7


# ---------------------------------------------------------------------------------------
# Door helpers
# ---------------------------------------------------------------------------------------
DOOR_NAME = re.compile(r"^P0*(\d{2,3})(?:E|$)", re.IGNORECASE)


def door_width_from_name(name: str) -> float | None:
    m = DOOR_NAME.match(name or "")
    if not m:
        return None
    cm = int(m.group(1))
    if 50 <= cm <= 300:
        return cm / 100.0
    return None


def door_from_insert(ins, ext, scale: float):
    """Hinge = insert point; leaf direction from the block extents (axis whose size matches width)."""
    width = door_width_from_name(ins.dxf.name)
    m = ins.matrix44()
    if ext is None:
        if width is None:
            return None
        axis = (1.0, 0.0)
    else:
        wx = (ext[2] - ext[0]) * abs(ins.dxf.xscale) * scale
        wy = (ext[3] - ext[1]) * abs(ins.dxf.yscale) * scale
        if width is None:
            width = min(wx, wy) if min(wx, wy) >= 0.5 else max(wx, wy)
            width = max(0.6, min(2.5, width))
        # leaf axis: the extent that best matches the leaf width; the swing axis is width + jamb
        if abs(wx - width) <= abs(wy - width):
            axis = (1.0 if (ext[0] + ext[2]) >= 0 else -1.0, 0.0)
        else:
            axis = (0.0, 1.0 if (ext[1] + ext[3]) >= 0 else -1.0)
    d = m.transform_direction(Vec3(axis[0], axis[1], 0))
    p = ins.dxf.insert
    return {"x": r3(p.x * scale), "y": r3(p.y * scale), "rot": deg360(math.atan2(d.y, d.x)), "width": round(width, 2)}


def deg360(rad: float) -> float:
    """Angle in degrees rounded to 0.1 and normalised to [0, 360)."""
    return round(math.degrees(rad), 1) % 360.0


def polyline_bulge_arcs(e, scale: float):
    """Swing arcs drawn as bulged LWPOLYLINE segments -> [((cx, cy), r, start, end)] (quarter-ish arcs only)."""
    out = []
    try:
        pts = list(e.get_points("xyb"))
    except Exception:
        return out
    n = len(pts)
    rng = range(n) if e.closed else range(n - 1)
    for i in rng:
        x1, y1, b = pts[i]
        x2, y2, _ = pts[(i + 1) % n]
        if abs(b) < 1e-6:
            continue
        span = math.degrees(4.0 * math.atan(abs(b)))
        if not 50 <= span <= 130:
            continue
        try:
            c, _sa, _ea, r = bulge_to_arc((x1, y1), (x2, y2), b)
        except Exception:
            continue
        r *= scale
        if 0.4 <= r <= 1.5:
            out.append(((c.x * scale, c.y * scale), r, (x1 * scale, y1 * scale), (x2 * scale, y2 * scale)))
    return out


def door_closers(doors: list[dict], barrier) -> list[tuple[list[float], int]]:
    """One segment per door spanning its opening in the closed position -> [(segment, door index)].

    The leaf direction `rot` is the open leaf; the closed leaf lies at +-90 deg (or, for
    blocks whose extents were ambiguous, along `rot` itself). The candidate that spans the
    opening runs through free space (not inside the wall) and its far end lands on the
    opposite jamb; the mirror candidate runs along the wall and is rejected. Doors that get
    no closer here are retried by fallback_closers.
    """
    out = []
    for di, d in enumerate(doors):
        hx, hy, w = d["x"], d["y"], d["width"]
        if w <= 0:
            continue

        def cand(off: float):
            a = math.radians(d["rot"] + off)
            ex, ey = hx + w * math.cos(a), hy + w * math.sin(a)
            far = barrier.distance(Point(ex, ey))
            inside = LineString([(hx, hy), (ex, ey)]).intersection(barrier).length / w
            return far, inside, ex, ey

        best = None
        for group in ((90.0, -90.0), (0.0,)):
            ok = [c for c in (cand(o) for o in group) if c[0] <= 0.3 and c[1] <= 0.5]
            if ok:
                best = min(ok, key=lambda c: (c[1], c[0]))
                break
        if best is not None:
            # extend into both jambs so the closed leaf actually meets the wall network
            far, _inside, ex, ey = best
            ux, uy = (ex - hx) / w, (ey - hy) / w
            e1, e2 = 0.12, far + 0.1
            out.append(([hx - ux * e1, hy - uy * e1, ex + ux * e2, ey + uy * e2], di))
    return out


def plug_openings(network, radius: float = 0.55, min_area: float = 0.1, max_area: float = 1.5, min_span: float = 0.45):
    """Seal door-sized gaps in the wall network (openings without a door entity, window recesses).

    A morphological closing fills every gap narrower than 2*radius; the fill pieces that are
    bar-like (area and span of an opening - corner fillets are smaller, corridors much larger)
    are reduced to the convex hull of their contact with the jambs and added to the network.
    """
    if network is None or network.is_empty:
        return network
    closed = network.buffer(radius, quad_segs=4).buffer(-radius, quad_segs=4)
    contact = network.buffer(0.03)
    plugs = []
    for p in iter_polygons(closed.difference(network)):
        if not (min_area <= p.area <= max_area):
            continue
        mrr = p.minimum_rotated_rectangle
        c = list(mrr.exterior.coords)
        if len(c) < 4:
            continue
        span = max(math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]), math.hypot(c[2][0] - c[1][0], c[2][1] - c[1][1]))
        if span < min_span:
            continue
        bar = p.intersection(contact).convex_hull.buffer(0.02)
        if bar.is_empty or bar.area <= 0.01:
            continue
        # a thin fillet chain hugging the inside corners of a small room has a hull that covers the
        # whole room; a real opening plug never grows past the plug size itself - keep the raw
        # fill piece in that case (it still seals a gap it spans, and a fillet chain seals nothing)
        if bar.area > 1.5 * max_area:
            bar = p.buffer(0.02)
        plugs.append(bar)
    if not plugs:
        return network
    return unary_union([network] + plugs)


# ---------------------------------------------------------------------------------------
# Realism helpers: bays, columns, ramps, zones
# ---------------------------------------------------------------------------------------
def seg_key(s) -> tuple:
    a, b = (s[0], s[1]), (s[2], s[3])
    return (a, b) if a <= b else (b, a)


def box_polygon(box, rot: float = 0.0) -> Polygon:
    """World polygon of a furniture / bay box rotated about its centre (degrees)."""
    poly = shp_box(*box)
    if rot:
        poly = shp_affinity.rotate(poly, rot, origin=((box[0] + box[2]) / 2, (box[1] + box[3]) / 2))
    return poly


def is_bay(item: dict) -> bool:
    """A car-sized generic outline on a basement furniture layer is a parking bay."""
    b = item["box"]
    w, h = b[2] - b[0], b[3] - b[1]
    short, long_ = min(w, h), max(w, h)
    return item.get("kind") == "generic" and BAY_SHORT[0] <= short <= BAY_SHORT[1] and BAY_LONG[0] <= long_ <= BAY_LONG[1]


def bay_label(txt: str) -> str | None:
    """A-PARK-TXT text -> bay label: the registered residence code, "Shared" for POOL, else the note."""
    t = txt.strip(" -_:.,")
    if not t:
        return None
    m = APT_TAG.match(t)
    if m:
        return apt_code(m.group(1), m.group(2), m.group(3)) or t.upper()
    up = t.upper()
    if up == "POOL":
        return "Shared"
    if up == "HANDICAP":
        return "Accessible"
    if up == "EXTRA":
        return "Extra"
    m = BAY_EXTRA.match(t)
    if m:
        inner = m.group(1).strip()
        mm = APT_TAG.match(inner)
        code = apt_code(mm.group(1), mm.group(2), mm.group(3)) if mm else ""
        return f"{code or inner.upper()} (extra)"
    return up if len(up) <= 4 else title_case(t)


def column_from_ring(ring) -> dict | None:
    """A small structural ring -> column {x, y, w, d, round?}; None when it is not column-like.

    Rotated rectangles (area well below the bbox area) are left as wall polygons so the
    viewer extrudes them as drawn - the contract has no column rotation.
    """
    if len(ring) < 3:
        return None
    poly = Polygon(ring)
    if not poly.is_valid or poly.is_empty:
        return None
    xmin, ymin, xmax, ymax = poly.bounds
    w, d = xmax - xmin, ymax - ymin
    if w > COLUMN_MAX_SIDE or d > COLUMN_MAX_SIDE or poly.area > COLUMN_MAX_AREA or min(w, d) < COLUMN_MIN_SIDE:
        return None
    is_round = (len(ring) >= 8 and abs(w - d) <= 0.15 * max(w, d)
                and poly.area >= 0.85 * math.pi * (max(w, d) / 2) ** 2)
    if not is_round and poly.area < COLUMN_BOXINESS * w * d:
        return None
    col = {"x": r3((xmin + xmax) / 2), "y": r3((ymin + ymax) / 2), "w": r3(w), "d": r3(d)}
    if is_round:
        col["round"] = True
    return col


def split_holes(poly, min_hole: float = 3.0, depth: int = 0) -> list[Polygon]:
    """Cut a polygon with holes into hole-free pieces (zone rings carry no holes).

    Holes below `min_hole` m2 (free-standing columns, which the viewer draws on top anyway)
    are simply filled. Each remaining hole is removed by a vertical cut through the middle
    of its bbox; the pieces are recursed until none has an interior. Slivers under 0.5 m2
    are dropped.
    """
    if poly is None or poly.is_empty or poly.geom_type != "Polygon":
        return [g for g in iter_polygons(poly) if not g.interiors] if poly is not None else []
    if poly.interiors and min_hole > 0:
        keep = [h for h in poly.interiors if Polygon(h).area >= min_hole]
        if len(keep) != len(poly.interiors):
            poly = Polygon(poly.exterior.coords, [h.coords for h in keep])
            if not poly.is_valid:
                poly = poly.buffer(0)
                if poly.geom_type != "Polygon":
                    return [g for g in iter_polygons(poly) for g in split_holes(g, min_hole, depth + 1)]
    if not poly.interiors:
        return [poly]
    if depth > 40:
        return [Polygon(poly.exterior.coords)]
    hole = max(poly.interiors, key=lambda h: Polygon(h).area)
    hx0, _hy0, hx1, _hy1 = Polygon(hole).bounds
    xmin, ymin, xmax, ymax = poly.bounds
    cx = (hx0 + hx1) / 2
    cutter = LineString([(cx, ymin - 1.0), (cx, ymax + 1.0)])
    try:
        pieces = shapely.ops.split(poly, cutter)
    except Exception:
        return [Polygon(poly.exterior.coords)]
    out = []
    for g in iter_polygons(pieces):
        if g.area >= 0.5:
            out.extend(split_holes(g, min_hole, depth + 1))
    return out


def ramp_polygons(lines) -> list[Polygon]:
    """A-RAMP linework (chevron slices, ladder rungs or two edge lines) -> ramp strip polygons.

    The slices are buffered, merged by a morphological closing, their holes filled and the
    line thickness removed again; closed parts of ramp size are kept. When nothing closes
    (a ramp drawn as two edge lines only) the strip between the two longest lines is used.
    """
    lines = [ln for ln in lines if ln.length > 0.05]
    if not lines:
        return []
    u = unary_union([ln.buffer(RAMP_LINE_BUFFER, quad_segs=2) for ln in lines])
    closed = u.buffer(RAMP_CLOSE, quad_segs=2).buffer(-RAMP_CLOSE, quad_segs=2)
    filled = unary_union([Polygon(p.exterior.coords) for p in iter_polygons(closed)])
    parts = []
    for p in iter_polygons(filled):
        for q in iter_polygons(p.buffer(-RAMP_LINE_BUFFER, quad_segs=2)):
            if RAMP_AREA[0] <= q.area <= RAMP_AREA[1]:
                parts.append(q)
    if not parts and len(lines) >= 2:
        a, b = sorted(lines, key=lambda ln: -ln.length)[:2]
        strip = valid_poly(list(a.coords) + list(b.coords)[::-1])
        if strip is not None and RAMP_AREA[0] <= strip.area <= RAMP_AREA[1]:
            parts = [strip]
    return parts


# ---------------------------------------------------------------------------------------
# Registry (apartment codes per floor) from buildingExplorer.ts - unit numbers only
# ---------------------------------------------------------------------------------------
UNIT_LINE = re.compile(r"^\s*([ABC])\('([^']+)',\s*(?:'[^']*',\s*)?\[([^\]]*)\]")


def load_registry() -> dict[int, list[str]]:
    """floor number -> registered apartment codes on that floor (duplexes on both floors)."""
    by_floor: dict[int, list[str]] = defaultdict(list)
    try:
        text = REGISTRY_TS.read_text(encoding="utf-8")
    except Exception:
        return {}
    for line in text.splitlines():
        m = UNIT_LINE.match(line)
        if not m:
            continue
        code = m.group(2)
        for f in re.findall(r"\d+", m.group(3)):
            by_floor[int(f)].append(code)
    return dict(by_floor)


# ---------------------------------------------------------------------------------------
# Apartment footprints: stack regions, door graph, code assignment
#
# Every enclosed floor cell ("piece": a labelled room ring, a Voronoi share of a cell that
# holds several labels, or an unlabelled cell) is assigned to a registered residence when the
# evidence is unambiguous, in this order:
#   tag      the residence code text sits inside the piece;
#   region   >= REGION_INSIDE of the piece lies inside the residence's stack region - the
#            A-AREAS outline drawn on this sheet, or the level-3 outline transferred by the
#            measured sheet offset (verified at run time by structural-wall overlap and by
#            every tag landing in its own stack);
#   graph    the piece's door-graph component (cells joined through door closers) carries
#            exactly one code and the piece lies in no other residence's region;
#   door     a balcony / terrace / garden that exactly one residence's rooms open onto by a
#            drawn door (doors from two residences = a shared strip, left unassigned);
#   edge     a balcony / terrace / garden with no door drawn whose only glazed neighbours
#            belong to one residence.
# Common areas (lobbies, lifts, technical, voids, retail, unlabelled core cells inside a lobby
# outline, unlabelled cells whose doors all open from common pieces) are never assigned.
# Anything else stays unassigned and is reported in the notes - including unlabelled GLAZED
# cells outside every outline (a balcony the sheet does not label): their floor kind is
# unknown, so they are never assigned, but every residence whose rooms open onto them through
# the glazing stays incomplete. A residence's areaSqm / outdoorSqm is the area of the UNION of
# its pieces (never a sum, so nothing counts twice) and is PUBLISHED ONLY when `complete` is
# true (a partial footprint keeps its measured totals in the manifest notes); `complete` is
# false while any enclosed cell mostly inside its stack, or any piece it opens onto, is
# unassigned, or a room label in the stack has no enclosed ring.
# ---------------------------------------------------------------------------------------
OUTLINE_MIN_AREA = 40.0      # m² - A-AREAS outlines this large are whole-residence / lobby outlines
OUTLINE_CLOSE_TOL = 0.05     # m - an open A-AREAS polyline whose ends are this close is closed
OUTLINE_MATCH = 0.90         # share of an outline inside a reference region that identifies its stack
REGION_INSIDE = 0.90         # share of a piece inside one stack region that assigns it
LOBBY_INSIDE = 0.50          # an unlabelled cell mostly inside a core lobby outline is core (stairs / lifts)
REGION_STRADDLE = 0.10       # a piece with more than this share in a second residence region straddles
COVERAGE_COMPLETE = 0.92     # share of the region's free floor that must be assigned for `complete`
UNACCOUNTED_SHARE_MAX = 0.02 # unassigned enclosed cells mostly inside the stack may total at most this share of areaSqm
CORE_SERVED_MAX_AREA = 20.0  # m² - an unlabelled cell up to this size entered only from common pieces is a core store
UNNAMED_CELL_MAX = 10.0      # m² - an assigned unlabelled cell this large is an unnamed room, not a closet / corridor
UNNAMED_SHARE_MAX = 0.15     # unlabelled cells may make up at most this share of a complete residence's floor
BIG_PART_INSIDE = 0.95       # an open-plan cell > ROOM_MAX_AREA lying this far inside one residence outline is a room cell
DOOR_PROBE = 0.35            # m - probe distance either side of a door closer for the door graph
DOOR_PROBE_SNAP = 0.40       # m - nearest piece within this distance when a probe lands in a wall
OUTDOOR_EDGE_MIN = 1.0       # m - shared edge (through glazing) for a balcony to follow a room's residence
OUTDOOR_EDGE_REACH = 0.80    # m - glazing + sill / parapet thickness bridged by that adjacency test
OUTDOOR_NEAR = 1.5           # m - an unassigned balcony piece / ringless balcony label this close to a footprint keeps it incomplete
GLAZED_CELL_SHARE = 0.25     # an unlabelled cell with this share of its boundary on glazing / balustrade lines is a
                             # glazed cell (an unlabelled balcony, a winter garden): its floor kind is unknown, so it
                             # is never assigned, but every residence it opens onto stays incomplete
GLAZING_TOUCH = 0.12         # m - a cell edge this close to a window / balustrade segment lies on it
SHAFT_HULL_MAX = 6.0         # m² - a shaft hatch whose hull is this small is a duct box (drawn as an X)
# Block B core lobby (lifts + stair landing) in the reference frame: the "Lobby Building B" ring as
# drawn on sheet A108-Floor4 (the level-8 ring lies 93 % inside it). The other sheets leave this
# core unlabelled, so without it the B wing's open cells would swallow the lobby.
LOBBY_B_REF = [[27.33, 9.7], [30.1, 9.7], [30.1, 12.7], [32.5, 13.1], [32.5, 15.3], [31.8, 17.0], [27.33, 17.75]]
CLOSER_JAMB_REACH = 0.45     # m - a fallback closer links its ends to the wall network within this distance
REFERENCE_SHEET = "A107-Floor3"   # its A-AREAS outlines define the stack regions for every level
REFERENCE_OVERLAP_MIN = 0.6  # structural-wall overlap (share of the smaller union) needed to transfer regions
# translation that maps each sheet's model space onto the reference frame; the other residential
# sheets share the origin exactly (measured by maximising structural-wall overlap, scout_offsets.py)
SHEET_TO_REFERENCE = {"5": (0.0, 138.736), "6": (0.0, 162.35), "8": (-91.65, 0.0), "9": (-463.738, 0.0), "10": (-195.388, 0.0)}
B_REGION_BOX = (27.3, 1.5, 46.0, 22.6)   # reference frame: the Block B plate, minus the A2/C2/core outlines
LOBBY_OUTLINE_MAX = 90.0     # m² - A-AREAS outlines without a tag up to this size are core lobbies
# residences the registry places on floors 0-1 that the sheets do not draw as residences: A105
# (level 1) draws RETAIL B, BUILDING MANAGEMENT and RETAIL C WEST / EAST in the B and C1 stacks and
# A104 (ground) repeats the same outlines unlabelled. They get a pin at the block only.
UNPLACEABLE = {
    "g": {"0/1 B": "sheet A104 draws the Block B stack as the unlabelled RETAIL B / management outlines",
          "0/1 C1": "sheet A104 draws the Block C stack as the unlabelled RETAIL C outlines"},
    "1": {"0/1 B": "sheet A105 draws RETAIL B and BUILDING MANAGEMENT in the Block B stack",
          "0/1 C1": "sheet A105 draws RETAIL C WEST / EAST and the lifts lobby in the Block C stack"},
}
COMMON_NAME = re.compile(r"lobby|\blifts?\b|elevator|technical|void over|planter|retail|management|parking entrance|^(east|west|building( [abc])?)$", re.IGNORECASE)
CORE_ONLY_OUTSIDE = re.compile(r"^(sas|stairs?|staircase|corridor)$", re.IGNORECASE)   # common only outside every residence region
OUTDOOR_NAME = re.compile(r"balcon|terrace|garden", re.IGNORECASE)   # outdoor pieces that may follow a residence
RESIDENCE_STACKS = ("A1", "A2", "B", "C1", "C2")
_REFERENCE: dict = {}


def stack_of(code: str) -> str:
    tail = code.split()[-1]
    return "B" if tail == "B" else tail


def outline_polygon(pts, closed: bool):
    """A-AREAS polyline -> polygon when closed (or nearly closed) and of residence size."""
    if len(pts) < 3:
        return None
    if not closed and math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1]) > OUTLINE_CLOSE_TOL:
        return None
    g = valid_poly(pts)
    if g is None or g.area < OUTLINE_MIN_AREA:
        return None
    return g


def iter_virtual(ins, depth: int = 0):
    if depth > 3:
        return
    try:
        for ve in ins.virtual_entities():
            if ve.dxftype() == "INSERT":
                yield from iter_virtual(ve, depth + 1)
            else:
                yield ve
    except Exception:
        return


def door_block_hint(ins, scale: float) -> dict | None:
    """Hinge, leaf and opening span read from a door block's own linework (world space).

    Blocks drawn along the building's diagonal grid (P_ENT_WOOD entrance assemblies, P90E21.5D)
    defeat the axis-aligned extents reading; the swing arc gives the hinge (centre) and leaf
    width (radius), the leaf line drawn from the hinge gives the open direction, the other arc
    end the closed direction, and the block points lying on that closed axis (jambs, fixed side
    panels) give the full span of the opening.
    """
    arcs: list = []
    segs: list = []
    for ve in iter_virtual(ins):
        t = ve.dxftype()
        try:
            if t == "ARC":
                r = ve.dxf.radius * scale
                span = (ve.dxf.end_angle - ve.dxf.start_angle) % 360.0
                if 0.4 <= r <= 1.5 and 50 <= span <= 130:
                    c = ve.dxf.center
                    sp, ep = ve.start_point, ve.end_point
                    arcs.append(((c.x * scale, c.y * scale), r, (sp.x * scale, sp.y * scale), (ep.x * scale, ep.y * scale)))
            elif t == "ELLIPSE":
                r = ve.dxf.major_axis.magnitude * scale
                if 0.4 <= r <= 1.5 and ve.dxf.ratio >= 0.9:
                    c = ve.dxf.center
                    sp, ep = ve.start_point, ve.end_point
                    arcs.append(((c.x * scale, c.y * scale), r, (sp.x * scale, sp.y * scale), (ep.x * scale, ep.y * scale)))
            elif t == "LWPOLYLINE":
                arcs.extend(polyline_bulge_arcs(ve, scale))
                pts = [(p[0] * scale, p[1] * scale) for p in ve.get_points("xy")]
                segs.extend((pts[i], pts[i + 1]) for i in range(len(pts) - 1))
                if ve.closed and len(pts) > 2:
                    segs.append((pts[-1], pts[0]))
            elif t == "LINE":
                segs.append(((ve.dxf.start.x * scale, ve.dxf.start.y * scale), (ve.dxf.end.x * scale, ve.dxf.end.y * scale)))
        except Exception:
            continue
    if not arcs:
        return None
    (cx, cy), r, sp, ep = max(arcs, key=lambda a: a[1])
    rot = None
    for a, b in segs:
        for p, q in ((a, b), (b, a)):
            if math.hypot(p[0] - cx, p[1] - cy) < 0.06 and abs(math.hypot(q[0] - cx, q[1] - cy) - r) < 0.15:
                rot = math.atan2(q[1] - cy, q[0] - cx)
                break
        if rot is not None:
            break
    ends = [math.atan2(sp[1] - cy, sp[0] - cx), math.atan2(ep[1] - cy, ep[0] - cx)]
    if rot is None:
        rot = ends[0]

    def angdiff(a: float, b: float) -> float:
        return abs((a - b + math.pi) % (2 * math.pi) - math.pi)

    closed = max(ends, key=lambda a: angdiff(a, rot))
    ux, uy = math.cos(closed), math.sin(closed)
    t0, t1 = 0.0, r
    for a, b in segs:
        for p in (a, b):
            dx, dy = p[0] - cx, p[1] - cy
            t, off = dx * ux + dy * uy, abs(dx * uy - dy * ux)
            if off <= 0.12 and -3.0 <= t <= 3.0:
                t0, t1 = min(t0, t), max(t1, t)
    return {"x": cx, "y": cy, "rot": deg360(rot), "width": round(r, 2), "closed": deg360(closed), "t0": t0, "t1": t1}


def fallback_closers(doors: list[dict], missing: list[int], barrier) -> list[tuple[list[float], int]]:
    """Closed-leaf segments for doors the ±90° rule could not close (see door_closers).

    Candidates: the span read from the door block (door_block_hint), then the leaf width along
    rot±90 / rot / rot+180 from the hinge. A candidate is accepted when it runs through free
    space (<= 50 % inside the wall network) and both ends reach the network within
    CLOSER_JAMB_REACH (the ends are then linked to the nearest wall point so the closed leaf
    actually seals the opening). Returns [(segment, door index), ...] (several segments per door).
    """
    out = []

    def nearest_on(p):
        q = shapely.ops.nearest_points(Point(p), barrier)[1]
        return (q.x, q.y), math.hypot(q.x - p[0], q.y - p[1])

    for i in missing:
        d = doors[i]
        w = d["width"]
        cands = []
        hint = d.get("_hint")
        if hint:
            a = math.radians(hint["closed"])
            cands.append(((hint["x"], hint["y"]), a, hint["t0"], hint["t1"], 0))
        for off in (90.0, -90.0, 0.0, 180.0):
            cands.append(((d["x"], d["y"]), math.radians(d["rot"] + off), 0.0, w, 1))
        best = None
        for (hx, hy), ang, t0, t1, rank in cands:
            ux, uy = math.cos(ang), math.sin(ang)
            a = (hx + ux * t0, hy + uy * t0)
            b = (hx + ux * t1, hy + uy * t1)
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            if L < 0.4:
                continue
            na, da = nearest_on(a)
            nb, db = nearest_on(b)
            if da > CLOSER_JAMB_REACH or db > CLOSER_JAMB_REACH:
                continue
            inside = LineString([a, b]).intersection(barrier).length / L
            if inside > 0.5:
                continue
            key = (rank, inside, abs(L - w))
            if best is None or key < best[0]:
                best = (key, a, b, na, nb)
        if best is None:
            continue
        _key, a, b, na, nb = best
        out.append(([a[0], a[1], b[0], b[1]], i))
        out.append(([a[0], a[1], na[0], na[1]], i))
        out.append(([b[0], b[1], nb[0], nb[1]], i))
    return out


def load_reference(dxf_dir: Path) -> dict | None:
    """Stack regions (reference frame) from the reference sheet's A-AREAS outlines + its tags.

    Returns {"regions": {stack: Polygon}, "structural": MultiPolygon} or None when the sheet is
    not available. Cached per process.
    """
    if "value" in _REFERENCE:
        return _REFERENCE["value"]
    path = dxf_dir / f"{REFERENCE_SHEET}.dxf"
    value = None
    try:
        doc = ezdxf.readfile(str(path))
        outlines, tags, structural = [], [], []
        for e in doc.modelspace():
            t = e.dxftype()
            raw = e.dxf.layer
            if "$0$" in raw:
                continue
            up = raw.strip().upper()
            if up == OUTLINE_LAYER and t in ("LWPOLYLINE", "POLYLINE"):
                for pts, closed in entity_polylines(e, 1.0):
                    g = outline_polygon(pts, closed)
                    if g is not None:
                        outlines.append(g)
            elif t in ("TEXT", "MTEXT") and text_layer_ok(raw):
                a = text_anchor(e, 1.0)
                if a and APT_TAG.match(a[0]):
                    m = APT_TAG.match(a[0])
                    code = apt_code(m.group(1), m.group(2), m.group(3))
                    if code:
                        tags.append((code, a[1], a[2]))
            elif t == "HATCH":
                low = up.lower()
                if "hatch" in low and ("conc" in low or "struc" in low):
                    g = hatch_polygon(e, 1.0)
                    if g is not None:
                        structural.append(g)
        regions = build_regions(outlines, tags, None)
        if all(k in regions for k in RESIDENCE_STACKS):
            value = {"regions": regions, "structural": unary_union(structural) if structural else None}
    except Exception:
        value = None
    _REFERENCE["value"] = value
    return value


def build_regions(outlines: list, tags: list, reference: dict | None) -> dict:
    """{stack: Polygon} from a sheet's A-AREAS outlines.

    An outline that contains exactly one stack's tag is that stack; otherwise the reference
    region that contains >= OUTLINE_MATCH of it (the ground sheet splits A1 in two schedule
    rows). Small untagged outlines are core lobbies ("lobbyA"/"lobbyC" by their position on the
    plate; "lobby<n>" without a reference). The Block B region is never drawn: it is the B plate
    box minus the other outlines.
    """
    per: dict[str, list] = defaultdict(list)
    n_lobby = 0
    for g in outlines:
        stacks = {stack_of(code) for code, x, y in tags if g.contains(Point(x, y))}
        if len(stacks) == 1:
            per[stacks.pop()].append(g)
            continue
        if len(stacks) > 1:
            continue
        if reference:
            best = max(reference.items(), key=lambda kv: g.intersection(kv[1]).area / g.area)
            if best[1].intersection(g).area / g.area >= OUTLINE_MATCH:
                per[best[0]].append(g)
                continue
        if g.area <= LOBBY_OUTLINE_MAX:
            if reference is None:
                key = "lobbyA" if g.centroid.y > 30 else "lobbyC"
            else:
                n_lobby += 1
                key = f"lobby{n_lobby}"
            per[key].append(g)
    regions = {k: unary_union(v).buffer(0) for k, v in per.items()}
    if reference is None and all(k in regions for k in ("A2", "C2")):
        regions["lobbyB"] = Polygon(LOBBY_B_REF)
        others = unary_union([regions[k] for k in ("A2", "C2", "C1", "lobbyC", "lobbyB") if k in regions])
        regions["B"] = shp_box(*B_REGION_BOX).difference(others.buffer(0.05))
    return regions


def stack_regions(level: str, outlines: list, tags: list, structural_union, dxf_dir: Path) -> tuple[dict, dict, dict | None]:
    """Stack regions for a sheet -> (regions, source per key, transfer report).

    The sheet's own A-AREAS outlines win; the reference sheet's outlines fill the rest after the
    sheet offset is verified (structural-wall overlap >= REFERENCE_OVERLAP_MIN and every tag on
    the sheet landing in its own stack).
    """
    reference = load_reference(dxf_dir)
    ref_sheet: dict = {}
    transfer = None
    if reference is not None:
        dx, dy = SHEET_TO_REFERENCE.get(level, (0.0, 0.0))
        ref_sheet = {k: shp_affinity.translate(g, -dx, -dy) for k, g in reference["regions"].items()}
        overlap = None
        if structural_union is not None and not structural_union.is_empty and reference["structural"] is not None:
            moved = shp_affinity.translate(structural_union, dx, dy)
            overlap = moved.intersection(reference["structural"]).area / max(1e-6, min(moved.area, reference["structural"].area))
        tags_ok = all(
            (stack_of(code) not in ref_sheet) or ref_sheet[stack_of(code)].contains(Point(x, y))
            for code, x, y in tags
        )
        ok = (overlap is None or overlap >= REFERENCE_OVERLAP_MIN) and tags_ok
        transfer = {"offset": [dx, dy], "structuralOverlap": round(overlap, 3) if overlap is not None else None,
                    "tagsInOwnStack": tags_ok, "used": ok}
        if not ok:
            ref_sheet = {}
    own = build_regions(outlines, tags, ref_sheet or None)
    regions: dict = dict(ref_sheet)
    regions.update(own)   # the sheet's own outline wins over the transferred one
    if "B" in ref_sheet and all(k in own for k in ("A2", "C2")):
        # keep the B plate clear of the sheet's own A2 / C2 outlines (the L-shaped A2 reaches the B wing)
        regions["B"] = ref_sheet["B"].difference(unary_union([own["A2"], own["C2"]]).buffer(0.05))
    source = {k: ("sheet" if k in own else "reference") for k in regions}
    return regions, source, transfer


def polylabel_of(geom):
    from shapely.algorithms.polylabel import polylabel as _polylabel

    polys = [g for g in iter_polygons(geom)]
    if not polys:
        return None
    big = max(polys, key=lambda g: g.area)
    try:
        p = _polylabel(big, tolerance=0.1)
        if big.contains(p):
            return p
    except Exception:
        pass
    return big.representative_point()


def partition_apartments(level: str, rooms: list[dict], ring_polys: dict, part_of_room: dict, room_parts: list,
                         clipped_parts: set, big_parts: list, plates: list, network, closer_pairs: list, apt_raw: list,
                         regions: dict, region_source: dict, transfer: dict | None, registry: dict, notes: dict,
                         window_segs: list | None = None) -> list[dict]:
    """Assign residence codes to rooms (rooms[].apartment) and build the apartments[] entries.

    See the section comment above for the rules. `rooms` are mutated in place; the returned
    list follows the contract in floorPlan3d.ts. Everything the assignment could not decide is
    written to notes["partition"].
    """
    floor = FLOOR_OF_LEVEL.get(level)
    report: dict = {"transfer": transfer, "tags": [], "conflicts": [], "unassigned": [], "unplaceable": {}, "codes": {}}
    notes["partition"] = report
    if floor is None:
        return []
    registered = list(registry.get(floor, []))
    unplaceable = UNPLACEABLE.get(level, {})
    report["unplaceable"] = dict(unplaceable)
    code_for_stack = {stack_of(c): c for c in registered if c not in unplaceable}
    tags = [(code, x, y) for code, _b, x, y in apt_raw]
    tag_codes = {code for code, _x, _y in tags}
    report["tags"] = sorted(tag_codes)
    res_regions = {k: g for k, g in regions.items() if k in RESIDENCE_STACKS}
    lobby_regions = {k: g for k, g in regions.items() if k.startswith("lobby")}
    report["regions"] = {k: round(g.area, 1) for k, g in regions.items()}
    report["regionSource"] = dict(region_source)
    report["bigParts"] = [{"area": round(b.area, 1), "in": {k: round(b.intersection(g).area / b.area, 2) for k, g in regions.items() if b.intersection(g).area / b.area >= 0.05}} for b in big_parts]

    # ---- pieces (a Voronoi share of a cell carries no measured area of its own; the cell does).
    # A labelled piece is the emitted ring (minus wall islands) - the polygon the viewer shows -
    # so the residence totals and the per-room areas are measured from the same geometry.
    pieces: list[dict] = []
    for i, r in enumerate(rooms):
        poly = ring_polys.get(i)
        if poly is None or "ring" not in r:
            continue
        pieces.append({"poly": poly, "name": r["name"], "room": i, "part": part_of_room.get(i),
                       "area": r["area"] if "area" in r else round(poly.area, 1), "outdoor": r.get("floor") == "outdoor"})
    labelled_parts = {p["part"] for p in pieces}
    for j, part in enumerate(room_parts):
        if j in labelled_parts:
            continue
        pieces.append({"poly": part, "name": None, "room": None, "part": j, "area": round(part.area, 1), "outdoor": False})
    glazing = segs_buffer(window_segs, GLAZING_TOUCH) if window_segs else None
    for p in pieces:
        p["code"] = None
        p["how"] = None
        p["clipped"] = p["part"] in clipped_parts
        fr = {k: p["poly"].intersection(g).area / p["poly"].area for k, g in regions.items()} if p["poly"].area > 0 else {}
        p["fr"] = fr
        # share of an unlabelled cell's boundary that runs along glazing / balustrade lines
        p["glazed"] = 0.0
        if p["name"] is None and glazing is not None:
            ext = p["poly"].exterior
            if ext.length > 0:
                p["glazed"] = ext.intersection(glazing).length / ext.length
        res_fr = {k: v for k, v in fr.items() if k in res_regions}
        name = p["name"]
        # fit per stack: a labelled room may extend over its block's core-lobby outline (the
        # penthouses do; the Block B duplexes use the core on the floor the lift does not serve),
        # so the same-block lobby counts for it - but for the shared A / C cores only when the room
        # lies mostly in the stack itself. Unlabelled cells never get that allowance.
        fit = {}
        for k, v in res_fr.items():
            lobby = fr.get(f"lobby{k[0]}", 0.0)
            if name is not None and (k == "B" or v >= 0.5):
                fit[k] = v + lobby
            else:
                fit[k] = v
        p["fit"] = fit
        best = max(fit, key=fit.get) if fit else None
        p["region"] = best if best is not None and fit[best] >= REGION_INSIDE else None
        in_res = best is not None and fit[best] >= 0.5
        lobby_share = sum(v for k, v in fr.items() if k in lobby_regions)
        if name is None:
            p["common"] = lobby_share >= LOBBY_INSIDE
        else:
            p["common"] = bool(COMMON_NAME.search(name)) or (bool(CORE_ONLY_OUTSIDE.match(name)) and not in_res)

    # ---- door graph: pieces sharing a cell are one node; closers join the cells on either side
    uf = UnionFind(len(pieces))
    by_part: dict[int, list[int]] = defaultdict(list)
    for idx, p in enumerate(pieces):
        by_part[p["part"]].append(idx)
    for members in by_part.values():
        for m in members[1:]:
            uf.union(members[0], m)
    tree = shapely.STRtree([p["poly"] for p in pieces]) if pieces else None

    def piece_at(x: float, y: float) -> int | None:
        if tree is None:
            return None
        pt = Point(x, y)
        hits = tree.query(pt, predicate="intersects")
        if len(hits):
            return int(hits[0])
        near = tree.query_nearest(pt, max_distance=DOOR_PROBE_SNAP)
        return int(near[0]) if len(near) else None

    door_pairs: list[tuple[int, int, int]] = []   # (door index, piece a, piece b) for every closed door
    for segm, door_idx in closer_pairs:
        x1, y1, x2, y2 = segm
        L = math.hypot(x2 - x1, y2 - y1)
        if L < 0.3:
            continue
        nx, ny = -(y2 - y1) / L, (x2 - x1) / L
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        a = piece_at(mx + nx * DOOR_PROBE, my + ny * DOOR_PROBE)
        b = piece_at(mx - nx * DOOR_PROBE, my - ny * DOOR_PROBE)
        if a is None or b is None or a == b:
            continue
        door_pairs.append((door_idx, a, b))
    # a small unlabelled cell whose doors all open from common pieces (a store off the lobby, a
    # duct room off the stair) is served by the core, not by the residence it is drawn beside.
    # (Size-capped and label-free: a whole wing whose only drawn door is its entrance from the
    # lobby - Level 5 A1, partitions in the skipped interior xref - is not a core store.)
    label_points = [Point(r["x"], r["y"]) for r in rooms]
    for _round in range(2):
        for idx, p in enumerate(pieces):
            if p["common"] or p["name"] is not None or p["outdoor"] or p["area"] > CORE_SERVED_MAX_AREA:
                continue
            if any(p["poly"].contains(q) for q in label_points):
                continue
            others = [b if a == idx else a for _d, a, b in door_pairs if idx in (a, b)]
            if others and all(pieces[o]["common"] for o in others):
                p["common"] = True
                p["coreServed"] = True
    report["coreServedCells"] = [{"area": p["area"], "x": round(p["poly"].representative_point().x, 1), "y": round(p["poly"].representative_point().y, 1)}
                                 for p in pieces if p.get("coreServed")]
    edges: list[tuple[int, int, int]] = []   # door-graph edges: indoor, non-common pieces only
    outdoor_doors: dict[int, list[int]] = defaultdict(list)   # outdoor piece -> indoor pieces with a door onto it
    for door_idx, a, b in door_pairs:
        if pieces[a]["common"] or pieces[b]["common"]:
            continue
        if pieces[a]["outdoor"] != pieces[b]["outdoor"]:
            o, i_ = (a, b) if pieces[a]["outdoor"] else (b, a)
            outdoor_doors[o].append(i_)
        if pieces[a]["outdoor"] or pieces[b]["outdoor"]:
            continue   # a balcony strip two residences open onto must not join them
        uf.union(a, b)
        edges.append((door_idx, a, b))
    report["doorEdges"] = len(edges)

    # ---- assignment: tag, region, graph, edge
    for code, x, y in tags:
        idx = piece_at(x, y)
        if idx is None or pieces[idx]["poly"].distance(Point(x, y)) > 0.01:
            continue
        p = pieces[idx]
        if code not in registered:
            report["conflicts"].append({"kind": "unregistered-tag", "code": code, "piece": p["name"]})
            continue
        if p["common"]:
            report["conflicts"].append({"kind": "tag-in-common", "code": code, "piece": p["name"]})
            continue
        if p["region"] and code_for_stack.get(p["region"]) not in (None, code):
            report["conflicts"].append({"kind": "tag-region", "code": code, "region": p["region"], "piece": p["name"]})
        p["code"], p["how"] = code, "tag"
    code_source = {c: ("tag" if c in tag_codes else "inferred") for c in registered}
    for p in pieces:
        if p["code"] or p["common"] or not p["region"]:
            continue
        code = code_for_stack.get(p["region"])
        if code is None:
            continue
        p["code"], p["how"] = code, "region"
    # graph conflicts: one component carrying two codes is a leaked door / missing closer
    comp_codes: dict[int, set] = defaultdict(set)
    for idx, p in enumerate(pieces):
        if p["code"]:
            comp_codes[uf.find(idx)].add(p["code"])
    conflicted_codes: set[str] = set()
    for root, codes in comp_codes.items():
        if len(codes) > 1:
            names = [pieces[i]["name"] or f"cell {pieces[i]['area']} m2" for i in range(len(pieces)) if uf.find(i) == root]
            leaks = [{"door": d, "between": [pieces[a]["name"] or f"cell {pieces[a]['area']} m2", pieces[b]["name"] or f"cell {pieces[b]['area']} m2"],
                      "codes": [pieces[a]["code"], pieces[b]["code"]]}
                     for d, a, b in edges if uf.find(a) == root and pieces[a]["code"] and pieces[b]["code"] and pieces[a]["code"] != pieces[b]["code"]]
            report["conflicts"].append({"kind": "merged-component", "codes": sorted(codes), "pieces": names[:12], "leakingDoors": leaks})
            conflicted_codes |= codes
    for idx, p in enumerate(pieces):
        if p["code"] or p["common"]:
            continue
        codes = comp_codes.get(uf.find(idx), set())
        if len(codes) != 1:
            continue
        # a piece inside another residence's stack (or a stack without a code here) never follows the graph
        best = max(p["fr"], key=lambda k: p["fr"][k] if k in res_regions else -1) if p["fr"] else None
        if best in res_regions and p["fr"][best] >= 0.5 and code_for_stack.get(best) not in codes:
            continue
        # an unlabelled cell outside every residence outline (an unlabelled balcony, a yard) has
        # no floor kind: a door alone does not make it indoor floor of the residence
        if p["name"] is None and not (best in res_regions and p["fr"][best] >= 0.5):
            continue
        p["code"], p["how"] = next(iter(codes)), "graph"
    # outdoor pieces follow the residence they open onto: by the doors drawn onto them first
    # (doors from two residences = a shared strip, left unassigned), else through glazing /
    # balustrade adjacency with exactly one residence
    indoor_assigned = [(i, p) for i, p in enumerate(pieces) if p["code"] and not p["outdoor"]]
    for idx, p in enumerate(pieces):
        if p["code"] or p["common"] or not (p["outdoor"] and p["name"] and OUTDOOR_NAME.search(p["name"])):
            continue
        reach = p["poly"].buffer(OUTDOOR_EDGE_REACH)
        contact: dict[str, float] = defaultdict(float)   # shared edge (m) per residence, all its rooms together
        for _i, q in indoor_assigned:
            if reach.intersects(q["poly"]):
                contact[q["code"]] += reach.intersection(q["poly"]).area / OUTDOOR_EDGE_REACH
        glazed = {c for c, L in contact.items() if L >= OUTDOOR_EDGE_MIN}
        doors = {pieces[i_]["code"] for i_ in outdoor_doors.get(idx, []) if pieces[i_]["code"]}
        p["adjacent"] = sorted(glazed | doors)
        if len(doors) == 1:
            p["code"], p["how"] = next(iter(doors)), "door"
        elif not doors and len(glazed) == 1:
            p["code"], p["how"] = glazed.pop(), "edge"
    # an unlabelled glazed cell outside every residence outline (a balcony the sheet does not
    # label, a winter garden) has no floor kind, so it is never assigned - but the residences
    # whose rooms open onto it through the glazing cannot be complete while it is unaccounted for
    for idx, p in enumerate(pieces):
        if p["code"] or p["common"] or p["name"] is not None or p["glazed"] < GLAZED_CELL_SHARE:
            continue
        if max((v for k, v in p["fr"].items() if k in res_regions), default=0.0) >= 0.5:
            continue   # inside a stack: reported through that residence's unaccounted cells
        reach = p["poly"].buffer(OUTDOOR_EDGE_REACH)
        contact: dict[str, float] = defaultdict(float)
        for _i, q in indoor_assigned:
            if reach.intersects(q["poly"]):
                contact[q["code"]] += reach.intersection(q["poly"]).area / OUTDOOR_EDGE_REACH
        p["glazedCell"] = True
        p["adjacent"] = sorted({c for c, L in contact.items() if L >= OUTDOOR_EDGE_MIN})

    # every unassigned piece remembers which residences open onto it (doors; glazing for
    # outdoor pieces): those residences cannot be complete while the piece is unaccounted for
    for idx, p in enumerate(pieces):
        if p["code"] or p["common"]:
            continue
        adjacent = set(p.get("adjacent", []))
        for _d, a, b in door_pairs:
            if idx in (a, b):
                o = b if a == idx else a
                if pieces[o]["code"]:
                    adjacent.add(pieces[o]["code"])
        p["adjacent"] = sorted(adjacent)

    # ---- write back and summarise per code
    for p in pieces:
        if p["room"] is not None and p["code"]:
            rooms[p["room"]]["apartment"] = p["code"]
    for p in pieces:
        if p["code"] or p["common"]:
            continue
        if p["name"] is None and p["area"] < UNNAMED_CELL_MAX and not p.get("adjacent") and not p.get("glazedCell"):
            continue
        c = p["poly"].representative_point()
        best = max(p["fr"], key=p["fr"].get) if p["fr"] else None
        share = round(p["fr"][best], 2) if best else 0.0
        if best in res_regions and code_for_stack.get(best) is None and share >= 0.5:
            why = f"stack {best} has no registered residence on this level" if best not in [stack_of(c) for c in unplaceable] else f"{[c for c in unplaceable if stack_of(c) == best][0]} is unplaceable on this sheet"
        elif best and share >= REGION_STRADDLE and share < REGION_INSIDE:
            why = f"straddles {best} ({share})"
        elif not best or share < REGION_STRADDLE:
            why = "outside every stack region"
        else:
            why = "no unambiguous evidence"
        if p.get("adjacent"):
            why = f"opens onto {p['adjacent']}"
        if p.get("glazedCell"):
            why = f"glazed unlabelled cell ({p['glazed']:.0%} glazing, floor kind unknown), " + (f"opens onto {p['adjacent']}" if p.get("adjacent") else "no residence opens onto it")
        report["unassigned"].append({"name": p["name"], "area": p["area"], "x": round(c.x, 1), "y": round(c.y, 1), "why": why})

    plate_union = unary_union([pl.buffer(-PLATE_INSET) for pl in plates]) if plates else None
    common_union = unary_union([p["poly"] for p in pieces if p["common"]]) if any(p["common"] for p in pieces) else None
    big_union = unary_union(big_parts) if big_parts else None
    apartments: list[dict] = []
    for code in registered:
        stack = stack_of(code)
        mine = [p for p in pieces if p["code"] == code]
        indoor = [p for p in mine if not p["outdoor"]]
        outdoor = [p for p in mine if p["outdoor"]]
        named_indoor = [p for p in indoor if p["room"] is not None]
        named_outdoor = [p for p in outdoor if p["room"] is not None]
        entry = {"code": code, "block": stack[0]}
        tag = next(((x, y) for c, x, y in tags if c == code), None)
        pin = None
        if tag is not None:
            pin = Point(*tag)
        elif indoor:
            pin = polylabel_of(unary_union([p["poly"] for p in indoor]))
        elif stack in res_regions:
            g = res_regions[stack].intersection(plate_union) if plate_union is not None else res_regions[stack]
            pin = polylabel_of(g if not g.is_empty else res_regions[stack])
        if pin is None:
            report["codes"][code] = {"skipped": "no tag, no pieces, no region"}
            continue
        entry["x"], entry["y"] = r3(pin.x), r3(pin.y)
        entry["rooms"] = len(named_indoor) + len(named_outdoor)
        # net internal area = every indoor piece of the footprint (labelled rooms and the unlabelled
        # corridors / closets between them); outdoor = balconies, terraces, gardens. The union, not
        # the sum: two pieces that cover the same floor must never count it twice.
        indoor_union = unary_union([p["poly"] for p in indoor]) if indoor else None
        mine_outdoor_union = unary_union([p["poly"] for p in outdoor]) if outdoor else None
        area = round(indoor_union.area, 1) if indoor_union is not None else 0.0
        out_area = round(mine_outdoor_union.area, 1) if mine_outdoor_union is not None else 0.0
        unlabelled_area = round(sum(p["area"] for p in indoor if p["room"] is None), 1)
        overlap = round(sum(p["poly"].area for p in indoor) - area, 1) if indoor else 0.0
        if overlap > 0.5:
            report["conflicts"].append({"kind": "overlapping-pieces", "code": code, "overlapSqm": overlap})
        # ---- completeness
        reasons = []
        if code in unplaceable:
            reasons.append("unplaceable")
        if not named_indoor:
            reasons.append("no labelled indoor room")
        region = res_regions.get(stack)
        if region is None:
            reasons.append("no stack region")
        else:
            if stack == "B" and "lobbyB" in lobby_regions:
                region = unary_union([region, lobby_regions["lobbyB"]])
            free = region
            if plate_union is not None:
                free = free.intersection(plate_union)
            if network is not None:
                free = free.difference(network)
            if common_union is not None:
                free = free.difference(common_union)
            outdoor_union = unary_union([p["poly"] for p in pieces if p["outdoor"]]) if any(p["outdoor"] for p in pieces) else None
            if outdoor_union is not None:
                free = free.difference(outdoor_union)
            covered = indoor_union.intersection(region).area if indoor_union is not None else 0.0
            coverage = covered / free.area if free.area > 0 else 0.0
            report["codes"].setdefault(code, {})["coverage"] = round(coverage, 3)
            if coverage < COVERAGE_COMPLETE:
                reasons.append(f"coverage {coverage:.2f}")
            # every enclosed cell that lies mostly in the stack must be accounted for: an
            # unassigned one (no door / region / graph evidence) leaves a hole in the total
            unaccounted = [p for p in pieces if not p["code"] and not p["common"] and not p["outdoor"]
                           and p["fr"].get(stack, 0.0) >= 0.5]
            unaccounted_area = sum(p["area"] for p in unaccounted)
            report["codes"].setdefault(code, {})["unaccountedSqm"] = round(unaccounted_area, 1)
            if unaccounted and (area <= 0 or unaccounted_area / area > UNACCOUNTED_SHARE_MAX):
                listed = [(p["name"] or f"cell {p['area']} m2", round(p["fr"][stack], 2)) for p in unaccounted[:4]]
                reasons.append(f"{len(unaccounted)} unassigned cell(s) in the stack ({unaccounted_area:.1f} m2): {listed}")
        # a piece this residence opens onto (door, or glazing for a balcony) that could not be
        # assigned - it also serves another residence, or it is an unlabelled cell outside the
        # outline whose floor kind is unknown - leaves one of the totals short; so does a
        # balcony / terrace piece left unassigned right beside the footprint, and an outdoor
        # label in the stack the sheet gives no enclosed ring
        opening = [p for p in pieces if not p["code"] and not p["common"] and code in p.get("adjacent", [])]
        if opening:
            reasons.append(f"unassigned piece(s) opening onto this residence: {[(p['name'] or f'cell {p['area']} m2', p['area'], p['adjacent']) for p in opening[:3]]}")
        if indoor_union is not None:
            near = indoor_union.buffer(OUTDOOR_NEAR)
            beside = [p for p in pieces if p["outdoor"] and not p["code"] and not p["common"] and p not in opening and near.intersects(p["poly"])]
            if beside:
                reasons.append(f"unassigned outdoor piece(s) beside the footprint: {[(p['name'], p['area']) for p in beside[:3]]}")
            unringed_out = [r["name"] for r in rooms if "ring" not in r and r.get("floor") == "outdoor" and OUTDOOR_NAME.search(r["name"])
                            and not COMMON_NAME.search(r["name"]) and near.contains(Point(r["x"], r["y"]))]
            if unringed_out:
                reasons.append(f"outdoor label(s) without ring beside the footprint: {unringed_out[:4]}")
            if big_union is not None and big_union.intersection(region).area > 1.0:
                reasons.append("unenclosed area (big part) in the stack")
            straddlers = [p for p in mine if not p["outdoor"] and p["fit"].get(stack, 0.0) < REGION_INSIDE]
            if straddlers:
                listed = [(p["name"] or f"cell {p['area']} m2", round(p["fit"].get(stack, 0.0), 2)) for p in straddlers[:4]]
                reasons.append(f"{len(straddlers)} piece(s) straddle the stack region: {listed}")
            if any(p["clipped"] for p in indoor) and region_source.get(stack) != "sheet":
                reasons.append("an open cell was cut along the transferred outline (no outline on this sheet)")
            other_tags = [c for c, x, y in tags if c != code and region.contains(Point(x, y))]
            if other_tags:
                reasons.append(f"foreign tag(s) in the stack: {other_tags}")
            unringed = [r["name"] for i, r in enumerate(rooms)
                        if "ring" not in r and r.get("floor") != "outdoor" and not COMMON_NAME.search(r["name"])
                        and region.contains(Point(r["x"], r["y"]))]
            if unringed:
                reasons.append(f"room(s) without ring in the stack: {unringed[:6]}")
        unnamed_big = [p for p in indoor if p["room"] is None and p["area"] >= UNNAMED_CELL_MAX]
        if unnamed_big:
            reasons.append(f"{len(unnamed_big)} unlabelled cell(s) >= {UNNAMED_CELL_MAX:.0f} m2 assigned (unnamed rooms)")
        # balcony glazing that does not close merges a balcony with the rooms behind it: the cell's
        # indoor / outdoor split is then arbitrary and neither total can be trusted
        mixed_parts = {p["part"] for p in indoor} & {p["part"] for p in outdoor}
        if mixed_parts:
            reasons.append(f"{len(mixed_parts)} cell(s) mix indoor and outdoor labels (glazing not closed)")
        oversized = [p for p in outdoor if p["area"] > 50.0 and p["fit"].get(stack, 0.0) >= 0.5]
        if oversized:
            reasons.append(f"outdoor cell of {oversized[0]['area']} m2 inside the stack (glazing not closed)")
        if area > 0 and unlabelled_area / area > UNNAMED_SHARE_MAX:
            reasons.append(f"unlabelled cells are {unlabelled_area / area:.0%} of the floor")
        if code in conflicted_codes:
            reasons.append("door graph merges this residence with another code")
        entry["complete"] = not reasons
        entry["source"] = code_source[code]
        # the measured totals are published only for a complete footprint (contract: "given only
        # when the footprint is complete"); a partial footprint's totals stay in the manifest notes
        if entry["complete"]:
            if area > 0:
                entry["areaSqm"] = area
            if out_area > 0:
                entry["outdoorSqm"] = out_area
        apartments.append(entry)
        report["codes"].setdefault(code, {}).update({
            "source": entry["source"], "pieces": {h: sum(1 for p in mine if p["how"] == h) for h in ("tag", "region", "graph", "door", "edge")},
            "rooms": entry["rooms"], "areaSqm": area, "outdoorSqm": out_area, "unlabelledSqm": unlabelled_area,
            "complete": entry["complete"], "incomplete": reasons,
        })
    report["missing"] = [c for c in registered if not any(a["code"] == c for a in apartments)]
    report["commonPieces"] = sum(1 for p in pieces if p["common"])
    if DEBUG is not None and "want" in DEBUG:
        DEBUG.update({"pieces": pieces, "uf": uf, "edges": edges})
    return apartments


# ---------------------------------------------------------------------------------------
# Per-level extraction
# ---------------------------------------------------------------------------------------
def extract(dxf_path: Path, level: str) -> tuple[dict, dict]:
    doc = ezdxf.readfile(str(dxf_path))
    msp = doc.modelspace()
    notes: dict[str, object] = {}

    # --- unit detection: sheets are metres unless the wall extents are implausibly large
    wall_ents = [e for e in msp if (norm_layer(e.dxf.layer) or "") in ("a-wall", "a-hatch-wall")]
    ext = ezdxf.bbox.extents(wall_ents or msp, fast=True)
    span = max(ext.size.x, ext.size.y) if ext.has_data else 0
    scale = 1.0
    if span > 5000:
        scale = 0.001
    elif span > 500:
        scale = 0.01
    notes["scale"] = scale

    # --- crop filter shared with the 2D renderer (room labels get a wider text-only window)
    crop = CROP.get(level)
    if crop:
        xmin, ymin, xmax, ymax = crop

        def in_window(e, pad: float) -> bool:
            b = ezdxf.bbox.extents([e], fast=True)
            if not b.has_data:
                return False
            return not (b.extmax.x * scale < xmin - pad or b.extmin.x * scale > xmax + pad
                        or b.extmax.y * scale < ymin - pad or b.extmin.y * scale > ymax + pad)

        def keep(e) -> bool:
            return in_window(e, 0.0)

        def keep_text(e) -> bool:
            return in_window(e, TEXT_CROP_PAD)
    else:
        def keep(e) -> bool:
            return True

        def keep_text(e) -> bool:
            return True

    wall_polys_by_kind: dict[str, list] = {"structural": [], "partition": []}
    wall_line_segs: list[list[float]] = []
    window_segs: list[list[float]] = []
    doors: list[dict] = []
    furniture: list[dict] = []
    stairs: list[list[float]] = []
    rooms_raw: list[tuple[str, float, float, float, bool, float]] = []  # name, x, y, priority, outside-crop, text height
    apt_raw: list[tuple[str, str, float, float]] = []  # code, block, x, y (sheet order)
    shaft_geoms: list = []
    trees: list[dict] = []
    furn_items: list[dict] = []  # loose furniture linework for clustering
    envelope_segs: list[list[float]] = []  # balustrades etc. - only used to close the footprint / rooms
    door_arcs: list = []
    door_lines: list = []
    blk_cache: dict = {}
    dropped = Counter()
    # realism collectors
    park_labels: list[tuple[str, float, float]] = []   # A-PARK-TXT bay labels
    slope_notes: list[tuple[str, float, float]] = []   # "13M@20%" ramp slope notes
    capacities: list[tuple[int, float, float]] = []    # "CAR PARK (46 CARS)"
    ramp_lines: list = []                              # A-RAMP linework
    water_segs: list[list[float]] = []                 # reflecting-pool linework
    landscape_polys: list = []                         # closed landscape outlines (garden beds, lawns)
    plant_polys: list = []                             # A-TREES hatches / closed outlines (planters)
    tree_lines: list = []                              # A-TREES canopy scribbles (garden fallback)
    column_cands: list[dict] = []                      # circles / closed outlines on column layers
    outlines: list = []                                # A-AREAS residence / lobby outlines (>= OUTLINE_MIN_AREA)

    def xref_ok(name: str) -> bool:
        if "$0$" in name:
            prefix = name.split("$0$")[0].strip().upper()
            return bool(prefix) and not prefix.startswith(SKIP_XREF_PREFIXES)
        return True

    def collect_annotation(raw_layer: str, txt: str, x: float, y: float):
        """Sheet notes that are not room labels: capacity, ramp slopes, parking-bay labels."""
        m = CAPACITY_RX.search(txt)
        if m:
            capacities.append((int(m.group(1)), x, y))
        m = SLOPE_RX.search(txt.replace("%%", "%"))
        if m:
            slope_notes.append((f"{m.group(1)}M@{m.group(2)}%", x, y))
        bare = (raw_layer.split("$0$")[-1] if "$0$" in raw_layer else raw_layer).strip().upper()
        if bare == PARK_TXT_LAYER:
            park_labels.append((txt, x, y))

    def add_closed_polys(e, target: list):
        if e.dxftype() == "HATCH":
            g = hatch_polygon(e, scale)
            if g is not None:
                target.extend(iter_polygons(g))
            return
        for pts, closed in entity_polylines(e, scale):
            if closed:
                g = valid_poly(pts)
                if g is not None:
                    target.append(g)

    def add_window_entity(e):
        for pts, closed in entity_polylines(e, scale):
            window_segs.extend(polyline_segments(pts, closed))

    def walk_insert(ins, handler, depth=0):
        if depth > 3:
            return
        try:
            for ve in ins.virtual_entities():
                if ve.dxftype() == "INSERT":
                    walk_insert(ve, handler, depth + 1)
                else:
                    handler(ve)
        except Exception:
            pass

    def add_apartment(txt: str, x: float, y: float) -> bool:
        m = APT_TAG.match(txt)
        if not m:
            return False
        code = apt_code(m.group(1), m.group(2), m.group(3))
        if code:
            apt_raw.append((code, m.group(2).upper(), x, y))
        return bool(code)

    def add_room_label(txt: str, x: float, y: float, layer: str, outside: bool, h: float = 0.25):
        # a label with the residence code as suffix ("ENTRANCE APT 7C1") also tags the residence
        m = APT_SUFFIX.search(txt)
        if m and m.start() > 0:
            code = apt_code(m.group(1), m.group(2), m.group(3))
            if code and not outside:
                apt_raw.append((code, m.group(2).upper(), x, y))
            txt = txt[:m.start()].strip(" -_:.,")
        if not txt or DIM_TEXT.match(txt) or len(txt) < 2:
            return
        if NOT_A_ROOM.search(txt):
            return
        is_room_layer = any(tok in layer for tok in ROOM_LAYER_TOKENS)
        if is_room_layer:
            # short texts on the room layer are grid / detail codes ("L.", "C 13") - except the
            # room acronyms the sheets use as names ("WC", "SAS")
            if ROOM_CODE.fullmatch(txt) or (len(txt) < 3 and txt.upper() not in ACRONYMS):
                return
            rooms_raw.append((title_case(txt), x, y, 2, outside, h))
        elif ROOM_WORDS.search(txt) and len(txt) <= 40:
            rooms_raw.append((title_case(txt), x, y, 1, outside, h))

    for e in msp:
        t = e.dxftype()
        if t in ("DIMENSION", "LEADER", "MLEADER", "POINT", "ATTDEF", "VIEWPORT", "SOLID", "WIPEOUT", "IMAGE"):
            continue
        raw_layer = e.dxf.layer

        # ---- text -> apartment tags (any non-dimension/non-SMB layer, inside the crop) and rooms
        if t in ("TEXT", "MTEXT"):
            if xref_ok(raw_layer) and keep_text(e):
                a0 = text_anchor(e, scale)
                if a0 is not None:
                    collect_annotation(raw_layer, *a0)
            if not text_layer_ok(raw_layer):
                continue
            if not keep_text(e):
                dropped["crop"] += 1
                continue
            anchor = text_anchor(e, scale)
            if anchor is None:
                continue
            txt, x, y = anchor
            inside = keep(e)
            if APT_TAG.match(txt):
                if inside:
                    add_apartment(txt, x, y)
                continue
            layer = norm_layer(raw_layer)
            if layer is None:
                continue
            add_room_label(txt, x, y, layer, not inside, text_height(e, scale))
            continue

        # ---- residence outlines: the area-schedule layer's closed polylines (its linework and
        # its row-number texts stay skipped)
        if t in ("LWPOLYLINE", "POLYLINE") and "$0$" not in raw_layer and raw_layer.strip().upper() == OUTLINE_LAYER:
            if keep(e):
                for pts, closed in entity_polylines(e, scale):
                    g = outline_polygon(pts, closed)
                    if g is not None:
                        outlines.append(g)
            continue

        layer = norm_layer(raw_layer)
        if layer is None:
            continue
        if not keep(e):
            dropped["crop"] += 1
            continue

        # ---- walls: hatch boundaries
        if t == "HATCH":
            if "hatch" in layer and ("wall" in layer or "walh" in layer):
                kind = "partition"
            elif "hatch" in layer and ("conc" in layer or "struc" in layer):
                kind = "structural"
            elif layer.startswith("ht01"):          # interior-set structural fill (Floor 5 xref)
                kind = "structural"
            elif layer.startswith(("ht02", "ht03")):  # interior-set partition fill
                kind = "partition"
            elif layer in TREE_LAYERS or layer in LANDSCAPE_LAYERS:
                add_closed_polys(e, plant_polys if layer in TREE_LAYERS else landscape_polys)
                continue
            elif layer in SHAFT_LAYERS:
                g = hatch_polygon(e, scale)
                if g is not None:
                    shaft_geoms.append(g)
                continue
            else:
                continue
            g = hatch_polygon(e, scale)
            if g is not None:
                wall_polys_by_kind[kind].append(g)
            continue

        # ---- INSERT blocks
        if t == "INSERT":
            name = e.dxf.name or ""
            lname = name.lower()
            ext_b = block_extents(doc, name, blk_cache)
            if "idtag" in layer or "room" in layer:
                # room-name tags carried as block attributes (Floor 7 IDTAG_2: NAME=...)
                p = e.dxf.insert
                px, py = p.x * scale, p.y * scale
                # a two-line tag (IDTAG_2: "LIVING /" over "DINING ROOM") carries one NAME attribute
                # per line, stored bottom line first: read them top to bottom, left to right in
                # the block's own frame (the A-wing copies squash both lines onto one y)
                attribs = attribs_in_reading_order(doc, e, scale, blk_cache)
                names = [a.dxf.text.strip() for a in attribs if a.dxf.tag.upper() in ("NAME", "ROOM_NAME", "TITLE") and a.dxf.text.strip()]
                if not names:
                    names = [a.dxf.text.strip() for a in attribs if ROOM_WORDS.search(a.dxf.text or "") or APT_TAG.match(a.dxf.text or "")]
                names = [re.sub(r"\s+", " ", n) for n in names]
                tags = [n for n in names if APT_TAG.match(n)]
                for n in tags:
                    add_apartment(n, px, py)
                names = [n for n in names if not APT_TAG.match(n)]
                txt = " ".join(names).strip(" -_:.,")
                if txt and not DIM_TEXT.match(txt):
                    heights = [float(a.dxf.height) * scale for a in e.attribs if a.dxf.get("height")]
                    add_room_label(txt, px, py, layer, False, max(heights) if heights else 0.25)
                continue
            if layer in DOOR_LAYERS:
                d = door_from_insert(e, ext_b, scale)
                if d:
                    hint = door_block_hint(e, scale)
                    if hint:
                        d["_hint"] = hint
                    doors.append(d)
                continue
            if "window" in lname or layer in ("a-alu", "a-claustra", "a-n-window") or "win" in layer or "glaz" in layer:
                if "window" in lname and ext_b is not None:
                    w = (ext_b[2] - ext_b[0]) * abs(e.dxf.xscale)
                    h = (ext_b[3] - ext_b[1]) * abs(e.dxf.yscale)
                    m = e.matrix44()
                    cy = (ext_b[1] + ext_b[3]) / 2
                    cx = (ext_b[0] + ext_b[2]) / 2
                    if w >= h:
                        a, b = m.transform(Vec3(ext_b[0], cy, 0)), m.transform(Vec3(ext_b[2], cy, 0))
                    else:
                        a, b = m.transform(Vec3(cx, ext_b[1], 0)), m.transform(Vec3(cx, ext_b[3], 0))
                    window_segs.append(seg((a.x * scale, a.y * scale), (b.x * scale, b.y * scale)))
                else:
                    walk_insert(e, lambda ve: add_window_entity(ve) if ve.dxftype() in ("LINE", "LWPOLYLINE", "POLYLINE", "ARC") else None)
                continue
            if layer in LANDSCAPE_LAYERS or lname == "landscape":
                # the landscape block: garden beds / lawns as closed outlines and hatches
                # (only its own entities - nested shrub symbols are not garden boundaries)
                try:
                    for ve in e.virtual_entities():
                        if ve.dxftype() in ("HATCH", "LWPOLYLINE", "POLYLINE", "SPLINE", "ELLIPSE"):
                            add_closed_polys(ve, landscape_polys)
                except Exception:
                    pass
                continue
            if layer in TREE_LAYERS or "tree" in lname or "palm" in lname:
                p = e.dxf.insert
                r = 1.5
                if ext_b is not None:
                    w = (ext_b[2] - ext_b[0]) * abs(e.dxf.xscale) * scale
                    h = (ext_b[3] - ext_b[1]) * abs(e.dxf.yscale) * scale
                    if 0.4 <= max(w, h) <= 12:
                        r = max(0.5, min(4.0, max(w, h) / 2))
                trees.append({"x": r3(p.x * scale), "y": r3(p.y * scale), "r": round(r, 2)})
                continue
            is_furn_layer = any(tok in layer for tok in FURN_LAYER_TOKENS)
            named_furn = lname == "bac" or any(tok in lname for tok, _k, _h in FURN_KIND_BY_NAME if tok != "bac")
            if is_furn_layer or named_furn:
                if ext_b is None:
                    dropped["furn-insert-noext"] += 1
                    continue
                (cx, cy), (w, h), rot = insert_box(e, ext_b, scale)
                if max(w, h) > 7 or min(w, h) < 0.1:
                    dropped["furn-insert-size"] += 1
                    continue
                if w < 0.25 and h < 0.25:
                    dropped["furn-insert-small"] += 1
                    continue
                kind, height = classify_furniture(layer, name, w, h, level)
                item = {"box": [r3(cx - w / 2), r3(cy - h / 2), r3(cx + w / 2), r3(cy + h / 2)], "kind": kind, "height": height}
                if abs(rot) >= 1:
                    item["rot"] = round(rot, 1)
                furniture.append(item)
                continue
            # anything else inserted on shaft/stair/wall layers: explode
            if layer in STAIR_LAYERS or layer in WALL_LINE_LAYERS:
                def h_(ve, layer=layer):
                    for pts, closed in entity_polylines(ve, scale):
                        (stairs if layer in STAIR_LAYERS else wall_line_segs).extend(polyline_segments(pts, closed))
                walk_insert(e, h_)
            continue

        # ---- curves by layer
        if t not in ("LINE", "ARC", "CIRCLE", "ELLIPSE", "LWPOLYLINE", "POLYLINE", "SPLINE"):
            continue
        if t == "CIRCLE" and any(tok in layer for tok in COLUMN_CIRCLE_LAYER_TOKENS):
            r = e.dxf.radius * scale
            if 0.12 <= r <= 0.7:
                c = e.dxf.center
                column_cands.append({"x": r3(c.x * scale), "y": r3(c.y * scale), "w": r3(2 * r), "d": r3(2 * r), "round": True})
        if layer in WALL_LINE_LAYERS or layer.startswith("a-wall"):
            for pts, closed in entity_polylines(e, scale):
                wall_line_segs.extend(polyline_segments(pts, closed))
        elif layer in WATER_LINE_LAYERS:
            # reflecting-pool linework: closes the envelope / room network like glazing does,
            # but is emitted as a water zone rather than as windows
            for pts, closed in entity_polylines(e, scale):
                segs = polyline_segments(pts, closed)
                water_segs.extend(segs)
                window_segs.extend(segs)
        elif layer in ("a-alu", "a-claustra") or "win" in layer or "glaz" in layer:
            add_window_entity(e)
        elif layer in STAIR_LAYERS:
            for pts, closed in entity_polylines(e, scale):
                stairs.extend(polyline_segments(pts, closed))
        elif any(tok in layer for tok in ENVELOPE_TOKENS) or layer == "a-flor-hral":
            for pts, closed in entity_polylines(e, scale):
                envelope_segs.extend(polyline_segments(pts, closed))
        elif layer in SHAFT_LAYERS:
            for pts, closed in entity_polylines(e, scale):
                if closed:
                    g = valid_poly(pts)
                    if g is not None:
                        shaft_geoms.append(g)
        elif layer in TREE_LAYERS:
            if t == "CIRCLE":
                c = e.dxf.center
                r = e.dxf.radius * scale
                if 0.3 <= r <= 8:
                    trees.append({"x": r3(c.x * scale), "y": r3(c.y * scale), "r": round(r, 2)})
            else:
                for pts, closed in entity_polylines(e, scale):
                    if closed:
                        g = valid_poly(pts)
                        if g is not None:
                            plant_polys.append(g)
                    elif len(pts) >= 2:
                        tree_lines.append(LineString(pts))
        elif layer in RAMP_LAYERS:
            for pts, closed in entity_polylines(e, scale):
                if len(pts) >= 2:
                    ramp_lines.append(LineString(pts + [pts[0]] if closed else pts))
        elif layer in LANDSCAPE_LAYERS:
            add_closed_polys(e, landscape_polys)
        elif any(tok in layer for tok in COLUMN_LAYER_TOKENS):
            for pts, closed in entity_polylines(e, scale):
                if closed and len(pts) >= 3:
                    col = column_from_ring(ring_out(pts))
                    if col is not None:
                        column_cands.append(col)
        elif layer in DOOR_LAYERS:
            if t == "ARC":
                r = e.dxf.radius * scale
                if 0.4 <= r <= 1.5:
                    c = e.dxf.center
                    door_arcs.append(((c.x * scale, c.y * scale), r, (e.start_point.x * scale, e.start_point.y * scale), (e.end_point.x * scale, e.end_point.y * scale)))
            elif t == "ELLIPSE":
                r = e.dxf.major_axis.magnitude * scale
                if 0.4 <= r <= 1.5 and 0.9 <= e.dxf.ratio <= 1.0:
                    c = e.dxf.center
                    sp, ep = e.start_point, e.end_point
                    door_arcs.append(((c.x * scale, c.y * scale), r, (sp.x * scale, sp.y * scale), (ep.x * scale, ep.y * scale)))
            elif t in ("LINE", "LWPOLYLINE", "POLYLINE"):
                if t == "LWPOLYLINE":
                    door_arcs.extend(polyline_bulge_arcs(e, scale))
                for pts, closed in entity_polylines(e, scale):
                    door_lines.append(pts)
        elif any(tok in layer for tok in FURN_LAYER_TOKENS):
            for pts, closed in entity_polylines(e, scale):
                segs = [(pts[i], pts[(i + 1) % len(pts)]) for i in (range(len(pts)) if closed else range(len(pts) - 1))]
                ends = pts if t in ("LWPOLYLINE", "POLYLINE", "SPLINE") else [pts[0], pts[-1]]
                if t == "CIRCLE":
                    ends = pts[:: max(1, len(pts) // 8)]
                furn_items.append({"pts": pts, "segs": segs, "ends": ends, "layer": layer})

    # ---- doors from loose swing arcs (sheets where doors are drawn, not inserted)
    if door_arcs:
        for (cx, cy), r, sp, ep in door_arcs:
            # the leaf is the line/polyline running from the hinge (arc centre) to one arc end
            leaf_end = sp
            for pts in door_lines:
                if any(math.hypot(x - cx, y - cy) < 0.08 for x, y in pts):
                    if any(math.hypot(x - ep[0], y - ep[1]) < 0.15 for x, y in pts):
                        leaf_end = ep
                        break
                    if any(math.hypot(x - sp[0], y - sp[1]) < 0.15 for x, y in pts):
                        leaf_end = sp
                        break
            if any(math.hypot(d["x"] - cx, d["y"] - cy) < 0.25 for d in doors):
                continue
            doors.append({"x": r3(cx), "y": r3(cy), "rot": deg360(math.atan2(leaf_end[1] - cy, leaf_end[0] - cx)), "width": round(r, 2)})
    # dedupe doors
    uniq = []
    for d in doors:
        if not any(abs(u["x"] - d["x"]) < 0.05 and abs(u["y"] - d["y"]) < 0.05 for u in uniq):
            uniq.append(d)
    doors = uniq

    # ---- wall polygons: union per kind, drop slivers, output rings + holes
    wall_polys_out = []
    wall_union_parts = []
    structural_union = None
    for kind, geoms in wall_polys_by_kind.items():
        if not geoms:
            continue
        u = unary_union(geoms)
        u = u.buffer(0) if not u.is_valid else u
        wall_union_parts.append(u)
        if kind == "structural":
            structural_union = u
        for poly in iter_polygons(u):
            if poly.area < MIN_RING_AREA or len(poly.exterior.coords) < 4:
                continue
            ring = emit_ring(poly, 0.01, MIN_RING_AREA)
            if ring is None:
                continue
            holes = []
            for hole in poly.interiors:
                hp = Polygon(hole)
                if hp.area >= MIN_RING_AREA and len(hole.coords) >= 4:
                    hr = emit_ring(hp, 0.01, MIN_RING_AREA)
                    if hr is not None:
                        holes.append(hr)
            item = {"ring": ring, "kind": kind}
            if holes:
                item["holes"] = holes
            wall_polys_out.append(item)
    wall_union = unary_union(wall_union_parts) if wall_union_parts else None
    hatch_fallback = wall_union is None or wall_union.is_empty
    notes["hatch_fallback"] = hatch_fallback

    # ---- columns: small free-standing structural rings leave wallPolys (the union used for
    # the footprint and the room network still contains them, so nothing else moves)
    columns_out: list[dict] = []
    kept_polys = []
    for item in wall_polys_out:
        col = column_from_ring(item["ring"]) if item["kind"] == "structural" and not item.get("holes") else None
        if col is None:
            kept_polys.append(item)
        else:
            columns_out.append(col)
    dropped["wallPolys-to-columns"] += len(wall_polys_out) - len(kept_polys)
    wall_polys_out = kept_polys
    for col in column_cands:
        if any(math.hypot(c["x"] - col["x"], c["y"] - col["y"]) < 0.3 for c in columns_out):
            dropped["column-dup"] += 1
            continue
        if wall_union is not None and not wall_union.is_empty and wall_union.intersects(Point(col["x"], col["y"])):
            dropped["column-in-wall"] += 1   # already drawn as a concrete hatch
            continue
        columns_out.append(col)

    # ---- wall lines: keep only those not already represented by a hatch polygon
    if wall_line_segs and wall_union is not None and not wall_union.is_empty:
        cover = wall_union.buffer(0.03)
        xs, ys = [], []
        for s in wall_line_segs:
            xs += [s[0], s[2], (s[0] + s[2]) / 2]
            ys += [s[1], s[3], (s[1] + s[3]) / 2]
        inside = shapely.contains_xy(cover, xs, ys)
        kept = []
        for i, s in enumerate(wall_line_segs):
            if not (inside[3 * i] and inside[3 * i + 1] and inside[3 * i + 2]):
                kept.append(s)
        dropped["wallLines-covered"] += len(wall_line_segs) - len(kept)
        wall_line_segs = kept
    wall_line_segs = dedupe_segs(wall_line_segs)
    window_segs = [s for s in dedupe_segs(window_segs) if math.hypot(s[2] - s[0], s[3] - s[1]) >= 0.08]
    water_keys = {seg_key(s) for s in water_segs}
    windows_out = [s for s in window_segs if seg_key(s) not in water_keys] if water_keys else window_segs
    dropped["windows-water-feature"] += len(window_segs) - len(windows_out)
    stairs = dedupe_segs(stairs)
    envelope_segs = dedupe_segs(envelope_segs)

    # ---- shafts
    shafts_out = []
    shaft_union = unary_union(shaft_geoms) if shaft_geoms else None
    if shaft_union is not None:
        for poly in iter_polygons(shaft_union):
            if poly.area >= 0.05:
                ring = emit_ring(poly, 0.01, 0.05)
                if ring is not None:
                    shafts_out.append(ring)

    # ---- footprint: closing over walls + partitions (+ furniture in pass 2); glazing,
    # balustrades and stair flights are added so the envelope is closed at window openings,
    # balcony edges and open stair wells.
    parts = []
    if wall_union is not None and not wall_union.is_empty:
        parts.append(wall_union)
    if wall_line_segs:
        parts.append(segs_buffer(wall_line_segs, 0.2))
    env = window_segs + envelope_segs
    if env:
        parts.append(segs_buffer(env, 0.15))
    if stairs:
        parts.append(segs_buffer(stairs, 0.15))

    def close_footprint(geoms):
        u = unary_union(geoms)
        closed = u.buffer(0.6, quad_segs=4).buffer(-0.5, quad_segs=4)
        plates = [Polygon(p.exterior.coords) for p in iter_polygons(closed) if p.area > 25]
        return u, plates

    # pass 1 - the building envelope alone; furniture drawn outside it (interior-design
    # overlays pasted onto the sheet) is not part of this level and must not extend the slab
    envelope = None
    if parts:
        _u, plates1 = close_footprint(parts)
        if plates1:
            envelope = unary_union(plates1).buffer(0.5)

    # ---- the SMB interior-design set carries its own AR2x furniture layers; when it is
    # pasted beside the plan, drop furniture in its extents. When it sits on the plan itself
    # (Floor 5: the interior set annotates apartment 5 A1 in place) the furniture is the wing's.
    smb_ents = [e for e in msp if e.dxf.layer.upper().startswith("SMB")]
    smb_box = None
    if smb_ents:
        b = ezdxf.bbox.extents(smb_ents, fast=True)
        if b.has_data:
            smb_box = shp_box(b.extmin.x * scale, b.extmin.y * scale, b.extmax.x * scale, b.extmax.y * scale)
            if crop:
                smb_box = smb_box.intersection(shp_box(*crop))
            notes["smb_extents"] = [round(v, 1) for v in smb_box.bounds] if not smb_box.is_empty else None
            if not smb_box.is_empty and envelope is not None and smb_box.intersection(envelope).area >= 0.5 * smb_box.area:
                notes["smb_in_place"] = True
                smb_box = None

    def in_smb(item) -> bool:
        if smb_box is None or smb_box.is_empty:
            return False
        bx = item["box"]
        return smb_box.contains(shapely.Point((bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2))

    before = len(furniture)
    furniture = [f for f in furniture if not in_smb(f)]
    dropped["furn-in-smb-set"] += before - len(furniture)

    # ---- furniture clusters from loose linework
    insert_boxes = [shp_box(*f["box"]) for f in furniture]
    insert_tree = shapely.STRtree(insert_boxes) if insert_boxes else None
    for cluster in cluster_items(furn_items):
        pts = [p for it in cluster for p in it["pts"]]
        segs = [s for it in cluster for s in it["segs"]]
        layer_hint = Counter(it["layer"] for it in cluster).most_common(1)[0][0]
        rot = dominant_angle(segs)
        boxr, w, h = oriented_box(pts, rot)
        if w < 0.25 and h < 0.25:
            dropped["furn-cluster-small"] += 1
            continue
        if min(w, h) < 0.1:
            # a lone line: closets / kitchen runs are often drawn as one front line along the
            # wall - give those a nominal 0.6 m depth centred on the line; anything else has no volume
            if ("closet" in layer_hint or "clos" in layer_hint or "kitchen" in layer_hint) and max(w, h) >= 0.6:
                cx, cy = (boxr[0] + boxr[2]) / 2, (boxr[1] + boxr[3]) / 2
                if w < 0.1:
                    w = 0.6
                else:
                    h = 0.6
                boxr = [r3(cx - w / 2), r3(cy - h / 2), r3(cx + w / 2), r3(cy + h / 2)]
            else:
                dropped["furn-cluster-small"] += 1
                continue
        if max(w, h) > 7:
            dropped["furn-cluster-huge"] += 1
            continue
        if insert_tree is not None:
            # loose linework that merely outlines an inserted fixture (tiles, splash lines) is redundant
            b = shp_box(*boxr)
            covered = sum(insert_boxes[i].intersection(b).area for i in insert_tree.query(b))
            if b.area > 0 and covered / b.area >= 0.6:
                dropped["furn-cluster-dup"] += 1
                continue
        kind, height = classify_furniture(layer_hint, None, w, h, level)
        item = {"box": boxr, "kind": kind, "height": height}
        if rot:
            item["rot"] = round(rot, 1)
        if in_smb(item):
            dropped["furn-in-smb-set"] += 1
            continue
        furniture.append(item)

    if envelope is not None and furniture:
        cx = [(f["box"][0] + f["box"][2]) / 2 for f in furniture]
        cy = [(f["box"][1] + f["box"][3]) / 2 for f in furniture]
        inside = shapely.contains_xy(envelope, cx, cy)
        kept = [f for f, ok in zip(furniture, inside) if ok]
        dropped["furn-outside-envelope"] += len(furniture) - len(kept)
        furniture = kept
    if furniture:
        parts.append(unary_union([shp_box(*f["box"]) for f in furniture]))
    footprint = []
    plates: list[Polygon] = []
    if parts:
        u, plates = close_footprint(parts)
        for plate in plates:
            ring = emit_ring(plate, 0.05, 25.0)
            if ring is not None:
                footprint.append(ring)
        if not footprint:
            hull = u.convex_hull
            if hull.geom_type == "Polygon" and hull.area > 1:
                footprint.append(ring_out(hull.exterior.coords))
                plates = [hull]
                notes["footprint_fallback"] = "convex hull"
    footprint_area = sum(Polygon(r).area for r in footprint if len(r) >= 3)

    # ---- rooms: dedupe (same name within 0.6 m), merge two-line and two-word labels
    # ("MAID'S" / "BEDROOM" is drawn as two texts, stacked on some sheets and side by side on
    # others; left unmerged, the two labels share one cell and neither gets a share of its own)
    rooms_raw.sort(key=lambda r: -r[3])
    rooms = []
    for name, x, y, _pri, outside, h in rooms_raw:
        dup = False
        for r in rooms:
            if abs(r["x"] - x) < 0.6 and abs(r["y"] - y) < 0.6:
                if r["name"].lower() == name.lower() or name.lower() in r["name"].lower():
                    dup = True
                    break
                if r["name"].lower() in name.lower():
                    r["name"] = name
                    dup = True
                    break
                # two texts closer in y than half their height sit on one line; anything more
                # is the next line (the line pitch is >= the text height)
                if abs(r["y"] - y) > 0.5 * max(h, r["_h"]):  # stacked two-line label
                    upper, lower = (r["name"], name) if r["y"] > y else (name, r["name"])
                    r["name"] = f"{upper} {lower}"
                    r["y"] = (r["y"] + y) / 2
                    dup = True
                    break
                # two words on one line: read left to right
                left, right = (r["name"], name) if r["x"] <= x else (name, r["name"])
                r["name"] = f"{left} {right}"
                r["x"] = (r["x"] + x) / 2
                dup = True
                break
        if not dup:
            rooms.append({"name": name, "x": x, "y": y, "_outside": outside, "_h": h})

    # ---- room polygons: the footprint minus the wall network (walls, thin partitions,
    # glazing, balustrades, shafts and the closed door leaves), one part per enclosed space
    network_parts = []
    if wall_union is not None and not wall_union.is_empty:
        network_parts.append(wall_union)
    if wall_line_segs:
        network_parts.append(segs_buffer(wall_line_segs, 0.07))
    if window_segs:
        network_parts.append(segs_buffer(window_segs, 0.05))
    if envelope_segs:
        network_parts.append(segs_buffer(envelope_segs, 0.07))
    if shaft_union is not None and not shaft_union.is_empty:
        network_parts.append(shaft_union)
    closers: list[list[float]] = []
    closer_pairs: list[tuple[list[float], int]] = []
    if doors and network_parts:
        barrier = unary_union(network_parts)
        closer_pairs = door_closers(doors, barrier)
        closed_doors = {i for _s, i in closer_pairs}
        missing = [i for i in range(len(doors)) if i not in closed_doors]
        fallback = fallback_closers(doors, missing, barrier) if missing else []
        notes["door_closers_fallback"] = len({i for _s, i in fallback})
        closer_pairs += fallback
        closers = [s for s, _i in closer_pairs]
        if closers:
            network_parts.append(segs_buffer(closers, 0.05))
    notes["door_closers"] = len({i for _s, i in closer_pairs})
    # ---- residence stack regions (own A-AREAS outlines, else the reference outlines transferred
    # by the verified sheet offset); needed now to tell an open-plan residence cell from a
    # corridor chain that runs through several residences
    uniq_tags: list[tuple[str, str, float, float]] = []
    seen_codes = set()
    for code, block, x, y in apt_raw:
        if code in seen_codes:
            continue
        seen_codes.add(code)
        uniq_tags.append((code, block, x, y))
    regions, region_source, transfer = ({}, {}, None)
    if level in FLOOR_OF_LEVEL:
        regions, region_source, transfer = stack_regions(level, outlines, [(c, x, y) for c, _b, x, y in uniq_tags], structural_union, dxf_path.parent)
    res_regions_early = {k: g for k, g in regions.items() if k in RESIDENCE_STACKS}
    common_labels = [Point(x, y) for name, x, y, _p, _o, _h in rooms_raw if COMMON_NAME.search(name)]
    indoor_labels = [Point(x, y) for name, x, y, _p, _o, _h in rooms_raw
                     if not COMMON_NAME.search(name) and floor_for(name) != "outdoor"]

    def residence_cell(part) -> bool:
        """An open-plan cell above ROOM_MAX_AREA that is one residence's interior, not a corridor chain."""
        if not res_regions_early or part.area > 3 * ROOM_MAX_AREA:
            return False
        if any(part.contains(p) for p in common_labels) or not any(part.contains(p) for p in indoor_labels):
            return False
        return max(part.intersection(g).area / part.area for g in res_regions_early.values()) >= BIG_PART_INSIDE

    def clip_by_regions(part) -> list:
        """Cut a corridor chain (a cell running through several stacks - typically the lobby and
        the residence entrances it serves, where the sheet draws no entrance door) along the stack
        outlines; the remainder outside every outline (balcony strips) is returned as well."""
        pieces = []
        rest = part
        for g in regions.values():
            inter = rest.intersection(g)
            pieces.extend(q for q in iter_polygons(inter) if q.area >= ROOM_MIN_AREA)
            rest = rest.difference(g)
            if rest.is_empty:
                break
        pieces.extend(q for q in iter_polygons(rest) if q.area >= ROOM_MIN_AREA)
        return pieces

    def split_necks(part) -> list:
        """Cells joined only through a paper-thin slit (the gap between a wall-line buffer and a
        window buffer along a balustrade) are separate cells: a morphological opening removes
        necks thinner than NECK_WIDTH; each opened piece takes its own share of the original."""
        opened = part.buffer(-NECK_WIDTH / 2, quad_segs=2).buffer(NECK_WIDTH / 2 + 0.02, quad_segs=2)
        cores = [q for q in iter_polygons(opened) if q.area >= 0.5 * ROOM_MIN_AREA]
        if len(cores) < 2:
            return [part]
        dropped["part-neck-split"] += 1
        out = []
        for q in cores:
            out.extend(g for g in iter_polygons(part.intersection(q)) if g.area >= 0.5 * ROOM_MIN_AREA)
        return out

    network = None
    room_parts: list[Polygon] = []      # candidate rooms
    big_parts: list[Polygon] = []       # corridor-like unions > ROOM_MAX_AREA
    clipped_parts: set[int] = set()     # room_parts indices that were cut along a stack outline
    if plates and network_parts:
        # door-sized gaps first (<= 1.1 m), then entrance/double-door widths (<= 1.5 m) with a
        # tighter bar filter so corridors and wide open-plan passages are never sealed
        network = plug_openings(unary_union(network_parts))
        network = plug_openings(network, radius=0.75, min_area=0.2, max_area=1.2, min_span=0.9)
        for plate in plates:
            for part in [q for part0 in iter_polygons(plate.buffer(-PLATE_INSET).difference(network)) for q in split_necks(part0)]:
                if part.area > ROOM_MAX_AREA and not residence_cell(part):
                    cut = clip_by_regions(part) if regions else []
                    if len(cut) < 2:
                        big_parts.append(part)
                        continue
                    dropped["big-part-clipped"] += 1
                    for piece in cut:
                        if piece.area > ROOM_MAX_AREA and not residence_cell(piece):
                            big_parts.append(piece)
                        elif piece.area >= ROOM_MIN_AREA and not piece.buffer(-0.12).is_empty:
                            clipped_parts.add(len(room_parts))
                            room_parts.append(piece)
                elif part.area >= ROOM_MIN_AREA and not part.buffer(-0.12).is_empty:
                    if part.area > ROOM_MAX_AREA:
                        dropped["big-part-as-residence-cell"] += 1
                    room_parts.append(part)
    if DEBUG is not None and "want" in DEBUG:
        DEBUG.update({"network": network, "plates": plates, "network_parts": network_parts, "regions": regions,
                      "room_parts": room_parts, "big_parts": big_parts, "closers": closers, "doors": doors})
    part_tree = shapely.STRtree(room_parts) if room_parts else None
    big_tree = shapely.STRtree(big_parts) if big_parts else None
    def find_part(x: float, y: float):
        """Index of the room part for a label: containing part, else nearest within LABEL_SNAP; -1 if in a big part."""
        p = Point(x, y)
        if part_tree is not None:
            hits = [i for i in part_tree.query(p, predicate="intersects")]
            if hits:
                return int(hits[0])
        if big_tree is not None and any(big_parts[i].contains(p) for i in big_tree.query(p, predicate="intersects")):
            return -1
        if part_tree is not None:
            near = part_tree.query_nearest(p, max_distance=LABEL_SNAP)
            if len(near):
                return int(near[0])
        return None

    # a label drawn inside a shaft ("EXHAUST FOR PARKING" on the duct itself) names that shaft,
    # not the cell beside it: it stays a point label and never snaps to a neighbouring room.
    # (A duct is hatched as a box with an X; its hull is the duct, the label sits between the arms.)
    shaft_polys = [g.convex_hull if g.convex_hull.area <= SHAFT_HULL_MAX else Polygon(g.exterior.coords)
                   for g in iter_polygons(shaft_union)] if shaft_union is not None and not shaft_union.is_empty else []
    shaft_tree = shapely.STRtree(shaft_polys) if shaft_polys else None

    def shaft_at(x: float, y: float) -> int | None:
        if shaft_tree is None:
            return None
        hits = shaft_tree.query(Point(x, y), predicate="intersects")
        return int(hits[0]) if len(hits) else None

    kept_rooms = []
    for r in rooms:
        sh = shaft_at(r["x"], r["y"])
        idx = None if sh is not None else find_part(r["x"], r["y"])
        if r.pop("_outside") and (idx is None or idx < 0):
            dropped["room-label-outside-crop"] += 1
            continue
        if sh is not None:
            r["_shaft"] = sh
            dropped["room-label-in-shaft"] += 1
        elif idx is not None and idx >= 0:
            r["_part"] = idx
        elif idx == -1:
            dropped["room-in-big-part"] += 1
        else:
            # an indoor room name with no cell within reach that sits outside every plate AND
            # outside every stack outline is a note pasted beside the plan (a neighbouring level's
            # "BATH"), not a room of this level (labels of an unenclosed wing stay: they sit in
            # their stack region and are reported as rooms without ring)
            if plates and floor_for(r["name"]) != "outdoor" and not COMMON_NAME.search(r["name"]) \
                    and min(pl.distance(Point(r["x"], r["y"])) for pl in plates) > LABEL_SNAP \
                    and not any(g.contains(Point(r["x"], r["y"])) for g in regions.values()):
                dropped["room-label-outside-footprint"] += 1
                continue
            dropped["room-no-part"] += 1
        kept_rooms.append(r)
    rooms = kept_rooms

    # ---- merge duplicate labels: the sheets often repeat one name several times in a
    # single room (four "GENERATOR" texts on one plant room, split "EXHAUST FOR PARKING"
    # lines). Same name in the same part — or within 5 m when neither has a part —
    # collapses to the first occurrence so the viewer shows one label per room. In a cell
    # that holds several different labels (a room chain whose doors are not drawn closed)
    # two same-name labels more than DUP_LABEL_DIST apart are two rooms (the two master
    # bedrooms of a penthouse), not a repeat.
    names_in_part: dict[int, set] = defaultdict(set)
    for r in rooms:
        if "_part" in r:
            names_in_part[r["_part"]].add(r["name"])
    merged: list[dict] = []
    for r in rooms:
        dup = False
        for m in merged:
            if m["name"] != r["name"]:
                continue
            if "_part" in r and "_part" in m:
                dup = m["_part"] == r["_part"] and (
                    len(names_in_part[r["_part"]]) == 1
                    or Point(m["x"], m["y"]).distance(Point(r["x"], r["y"])) <= DUP_LABEL_DIST)
            elif "_part" not in r and "_part" not in m:
                if "_shaft" in r or "_shaft" in m:
                    dup = r.get("_shaft") == m.get("_shaft")   # one label per shaft
                else:
                    dup = Point(m["x"], m["y"]).distance(Point(r["x"], r["y"])) <= 5.0
            if dup:
                break
        if dup:
            dropped["room-label-duplicate"] += 1
            continue
        merged.append(r)
    rooms = merged

    # ---- one polygon per label. Labels that share a part (open-plan living/dining, a lobby
    # chain) split it between them by nearest label so the viewer never gets identical rings.
    by_part: dict[int, list[int]] = defaultdict(list)
    for i, r in enumerate(rooms):
        if "_part" in r:
            by_part[r["_part"]].append(i)
    room_polys: dict[int, Polygon] = {}
    split_rooms: set[int] = set()   # Voronoi shares of one cell - no measured area of their own
    for idx, members in by_part.items():
        part = room_parts[idx]
        if len(members) == 1:
            i = members[0]
            # a small-room label alone in a wing-sized cell (Level 5: "STOR" is the only label the
            # sheet itself carries in the A1 wing whose partitions live in the skipped interior
            # xref) does not name that cell: the label stays a point, the cell an unlabelled piece
            if part.area > SMALL_ROOM_MAX_AREA and SMALL_ROOM_NAME.search(rooms[i]["name"]):
                dropped["room-label-in-oversized-cell"] += 1
                continue
            room_polys[i] = part
            continue
        pts = [Point(rooms[i]["x"], rooms[i]["y"]) for i in members]
        try:
            cells = list(shapely.voronoi_polygons(shapely.MultiPoint(pts), extend_to=part).geoms)
        except Exception:
            cells = []
        # every label gets the fragment of its Voronoi cell nearest to it - never the whole cell:
        # two labels holding the same polygon would count that floor twice in the residence total
        for i, p in zip(members, pts):
            poly = None
            for cell in cells:
                if cell.intersects(p):
                    pieces = [g for g in iter_polygons(cell.intersection(part)) if g.area >= 0.05]
                    if pieces:
                        poly = min(pieces, key=lambda g: g.distance(p))
                    break
            if poly is not None and poly.area >= ROOM_MIN_AREA:
                room_polys[i] = poly
            else:
                dropped["room-share-too-small"] += 1   # label stays a point; its floor joins a neighbour's share
        holders = [i for i in members if i in room_polys]
        if not holders:
            continue   # the cell stays an unlabelled piece of whichever residence it lies in
        dropped["room-part-split"] += len(holders)
        split_rooms.update(holders)
        # a Voronoi cell can cut a non-convex room cell into disconnected fragments and only the
        # fragment nearest its label was kept: give every leftover fragment to the neighbouring
        # share it borders most, so the shares still cover the whole cell (its area stays
        # accounted for in the residence total)
        for _round in range(6):
            covered = unary_union([room_polys[i] for i in holders])
            leftovers = [g for g in iter_polygons(part.difference(covered)) if g.area >= 0.05]
            if not leftovers:
                break
            moved = False
            for frag in leftovers:
                touch = frag.buffer(0.03)
                best = max(holders, key=lambda i: touch.intersection(room_polys[i]).area)
                if touch.intersection(room_polys[best]).area <= 0:
                    continue
                merged_poly = unary_union([room_polys[best], frag]).buffer(0)
                if merged_poly.geom_type == "Polygon":
                    room_polys[best] = merged_poly
                    moved = True
            if not moved:
                break

    # ---- room rings (+ measured area for rooms that own their whole cell)
    part_of_room: dict[int, int] = {}
    ring_polys: dict[int, Polygon] = {}   # the emitted ring, minus the cell's wall islands - what the area counts
    for i, r in enumerate(rooms):
        part = r.pop("_part", None)
        r.pop("_h", None)
        r.pop("_shaft", None)
        if part is not None and i in room_polys:
            part_of_room[i] = part
        r["x"], r["y"] = r3(r["x"]), r3(r["y"])
        r["floor"] = floor_for(r["name"])
        poly = room_polys.get(i)
        if poly is None:
            continue
        ring = emit_ring(poly, ROOM_RING_SIMPLIFY, ROOM_MIN_AREA)
        if ring is not None and Polygon(ring).distance(Point(r["x"], r["y"])) > LABEL_SNAP:
            dropped["room-ring-far"] += 1   # a snapped label whose split/repaired piece drifted away
            ring = None
        if ring is not None:
            r["ring"] = ring
            ring_poly = Polygon(ring)
            # wall islands inside the cell (columns, a closet drawn as an enclosed island) are
            # holes of the cell polygon; the emitted ring is its exterior, so the measured floor
            # is the ring minus those islands
            holes = [Polygon(h.coords) for h in poly.interiors if Polygon(h.coords).area >= 0.05]
            floor_poly = ring_poly.difference(unary_union(holes)) if holes else ring_poly
            ring_polys[i] = floor_poly
            # net internal, measured from the as-built ring - for a room that owns its whole cell;
            # an indoor cell above SINGLE_ROOM_MAX_AREA under one label is an open-plan zone or an
            # unpartitioned wing (the Level 3 B template's "DINING ROOM"), not a measured room
            if i not in split_rooms and (r["floor"] == "outdoor" or floor_poly.area <= SINGLE_ROOM_MAX_AREA):
                r["area"] = round(floor_poly.area, 1)
            elif i not in split_rooms:
                dropped["room-area-open-plan"] += 1
            # Anchor the label at the room's visual centre (pole of inaccessibility) rather
            # than wherever the text happened to sit on the sheet — labels stop hugging walls.
            try:
                from shapely.algorithms.polylabel import polylabel as _polylabel

                anchor = _polylabel(ring_poly, tolerance=0.1)
                if ring_poly.contains(anchor):
                    r["x"], r["y"] = r3(anchor.x), r3(anchor.y)
            except Exception:
                pass

    # ---- residence footprints: rooms[].apartment + apartments[] (registry-checked, see
    # partition_apartments). Levels without registered residences (basements) keep the plain
    # tag reading: every residence tag drawn (storage / bay allocations) becomes a pin and tags
    # the room it sits in.
    if level in FLOOR_OF_LEVEL:
        apartments = partition_apartments(level, rooms, ring_polys, part_of_room, room_parts, clipped_parts, big_parts, plates,
                                          network, closer_pairs, uniq_tags, regions, region_source, transfer, load_registry(), notes,
                                          window_segs + envelope_segs)
    else:
        apartments = [{"code": code, "block": block, "x": r3(x), "y": r3(y)} for code, block, x, y in uniq_tags]
        for r in rooms:
            if "ring" not in r:
                continue
            ring_poly = Polygon(r["ring"])
            for a in apartments:
                if ring_poly.contains(Point(a["x"], a["y"])):
                    r["apartment"] = a["code"]
                    break
    for d in doors:
        d.pop("_hint", None)

    # ---- parking bays (basements): car-sized outlines leave the furniture list; each takes
    # the nearest A-PARK-TXT label that sits inside its outline or within BAY_LABEL_DIST of
    # its centre, one label per bay
    bays: list[dict] = []
    if level.startswith("b"):
        rest = []
        for f in furniture:
            if is_bay(f):
                bay = {"box": f["box"]}
                if f.get("rot"):
                    bay["rot"] = f["rot"]
                bays.append(bay)
            else:
                rest.append(f)
        furniture = rest
        pairs = []
        for bi, bay in enumerate(bays):
            b = bay["box"]
            cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
            outline = box_polygon(b, bay.get("rot", 0.0)).buffer(BAY_LABEL_INSIDE)
            for li, (_txt, x, y) in enumerate(park_labels):
                dc = math.hypot(x - cx, y - cy)
                if dc <= BAY_LABEL_DIST or outline.contains(Point(x, y)):
                    pairs.append((dc, bi, li))
        used_labels: set[int] = set()
        labelled: set[int] = set()
        for _dc, bi, li in sorted(pairs):
            if bi in labelled or li in used_labels:
                continue
            lab = bay_label(park_labels[li][0])
            if lab:
                bays[bi]["label"] = lab
                labelled.add(bi)
                used_labels.add(li)
        dropped["park-labels-unused"] += len(park_labels) - len(used_labels)
    capacity = capacities[0][0] if capacities else None
    if len({c[0] for c in capacities}) > 1:
        notes["capacity_notes"] = sorted({c[0] for c in capacities})

    # ---- zones
    zones: list[dict] = []
    ramp_polys = ramp_polygons(ramp_lines)
    ramp_union = unary_union(ramp_polys) if ramp_polys else None
    for poly in ramp_polys:
        ring = emit_ring(poly, ZONE_SIMPLIFY, RAMP_AREA[0])
        if ring is None:
            continue
        z = {"kind": "ramp", "ring": ring}
        near = sorted((poly.distance(Point(x, y)), txt) for txt, x, y in slope_notes)
        labels = []
        for d, txt in near:
            if d <= RAMP_LABEL_DIST and txt not in labels:
                labels.append(txt)
        if labels:
            z["label"] = ", ".join(labels)
        zones.append(z)
    if ramp_lines and not ramp_polys:
        dropped["ramp-not-closed"] += 1
    # parking: the basement plate minus rooms with rings, shafts, ramps and the wall network;
    # a part counts only when it actually serves bays / the ramp / the CAR PARK note
    if level.startswith("b") and plates and network is not None:
        blockers = [network]
        ring_polys = [Polygon(r["ring"]) for r in rooms if "ring" in r]
        if ring_polys:
            blockers.append(unary_union(ring_polys))
        if shaft_union is not None and not shaft_union.is_empty:
            blockers.append(shaft_union)
        if ramp_union is not None:
            blockers.append(ramp_union)
        free = unary_union([p.buffer(-PLATE_INSET) for p in plates]).difference(unary_union(blockers))
        bay_union = unary_union([box_polygon(b["box"], b.get("rot", 0.0)) for b in bays]) if bays else None
        for part in iter_polygons(free):
            if part.area <= PARKING_MIN_AREA:
                continue
            served = ((bay_union is not None and part.intersects(bay_union))
                      or (ramp_union is not None and part.distance(ramp_union) < 0.5)
                      or any(part.contains(Point(x, y)) for _n, x, y in capacities))
            if not served:
                dropped["parking-part-unserved"] += 1
                continue
            # islands inside the apron (storage cages, lobbies, plant rooms) are holes; the
            # contract's rings carry none, so the apron is cut into hole-free pieces (every
            # piece a pinch splits off is kept - none of the served apron may vanish)
            for piece in split_holes(part):
                for ring in emit_rings(piece, ZONE_SIMPLIFY, 0.5):
                    zones.append({"kind": "parking", "ring": ring, "label": "Car park"})
    # water: pool rooms (nomenclature / IDTAG labels only) and the reflecting-pool linework
    for r in rooms:
        if "ring" in r and WATER_ROOM.search(r["name"]):
            zones.append({"kind": "water", "ring": r["ring"], "label": r["name"]})
    if water_segs:
        wxs = [v for s in water_segs for v in (s[0], s[2])]
        wys = [v for s in water_segs for v in (s[1], s[3])]
        wb = shp_box(min(wxs), min(wys), max(wxs), max(wys))
        if WATER_FEATURE_AREA[0] <= wb.area <= WATER_FEATURE_AREA[1]:
            zones.append({"kind": "water", "ring": ring_out(wb.exterior.coords), "label": "Water feature"})
        else:
            dropped["water-feature-size"] += 1
    # garden: PRIVATE GARDEN ring, else the smallest landscape outline enclosing the label,
    # else the A-TREES canopy cluster next to it
    tree_clusters = None
    for r in rooms:
        if not GARDEN_ROOM.match(r["name"]):
            continue
        if "ring" in r:
            zones.append({"kind": "garden", "ring": r["ring"], "label": r["name"]})
            continue
        p = Point(r["x"], r["y"])
        cands = [g for g in landscape_polys if GARDEN_AREA[0] <= g.area <= GARDEN_AREA[1] and g.contains(p)]
        poly = min(cands, key=lambda g: g.area) if cands else None
        if poly is None and tree_lines:
            if tree_clusters is None:
                tree_clusters = list(iter_polygons(unary_union([ln.buffer(1.0, quad_segs=2) for ln in tree_lines])))
            near = [(g.distance(p), g) for g in tree_clusters if g.distance(p) <= GARDEN_TREES_DIST]
            if near:
                poly = Polygon(min(near, key=lambda t: t[0])[1].exterior.coords)
        if poly is None:
            dropped["garden-no-polygon"] += 1
            continue
        ring = emit_ring(poly, ZONE_SIMPLIFY, 1.0)
        if ring is not None:
            zones.append({"kind": "garden", "ring": ring, "label": r["name"]})
    for r in rooms:
        if "ring" in r and TERRACE_ROOM.match(r["name"]):
            zones.append({"kind": "terrace", "ring": r["ring"], "label": r["name"]})
    # plant: the PLANTER room ring when the label sits inside it, else the A-TREES planting
    # hatch next to the label, else a snapped ring of planter size, else a disc around the
    # label. (A label on the planter wall can snap to the neighbouring terrace / garden part,
    # so a ring the label is not inside, or one above planter size, is not trusted.)
    for r in rooms:
        if not PLANTER_ROOM.match(r["name"]):
            continue
        p = Point(r["x"], r["y"])
        ring_poly = Polygon(r["ring"]) if "ring" in r else None
        ring_ok = ring_poly is not None and ring_poly.area <= PLANTER_AREA[1]
        cands = [(g.distance(p), g) for g in plant_polys if PLANTER_AREA[0] <= g.area <= PLANTER_AREA[1] and g.distance(p) <= PLANTER_DIST]
        if ring_ok and ring_poly.buffer(0.02).contains(p):
            zones.append({"kind": "plant", "ring": r["ring"], "label": r["name"]})
            continue
        if cands:
            poly = min(cands, key=lambda t: t[0])[1]
        elif ring_ok:
            zones.append({"kind": "plant", "ring": r["ring"], "label": r["name"]})
            continue
        else:
            if ring_poly is not None:
                dropped["planter-ring-too-big"] += 1
            poly = p.buffer(PLANTER_RADIUS, quad_segs=4)
            dropped["planter-disc"] += 1
        ring = emit_ring(poly, ZONE_SIMPLIFY, 0.3)
        if ring is not None:
            zones.append({"kind": "plant", "ring": ring, "label": r["name"]})

    # ---- bbox over everything emitted
    xs, ys = [], []
    for ring in footprint + shafts_out + [w["ring"] for w in wall_polys_out] + [z["ring"] for z in zones]:
        for x, y in ring:
            xs.append(x); ys.append(y)
    for c in columns_out:
        xs += [c["x"] - c["w"] / 2, c["x"] + c["w"] / 2]; ys += [c["y"] - c["d"] / 2, c["y"] + c["d"] / 2]
    for b in bays:
        xs += [b["box"][0], b["box"][2]]; ys += [b["box"][1], b["box"][3]]
    for s in wall_line_segs + window_segs + stairs:
        xs += [s[0], s[2]]; ys += [s[1], s[3]]
    for f in furniture:
        xs += [f["box"][0], f["box"][2]]; ys += [f["box"][1], f["box"][3]]
    for d in doors:
        xs.append(d["x"]); ys.append(d["y"])
    if not xs:
        xs, ys = [0.0], [0.0]
    bbox = [r3(min(xs)), r3(min(ys)), r3(max(xs)), r3(max(ys))]

    plan = {
        "level": level,
        "units": "m",
        "bbox": bbox,
        "footprint": footprint,
        "wallPolys": wall_polys_out,
        "wallLines": wall_line_segs,
        "windows": windows_out,
        "doors": doors,
        "furniture": furniture,
        "stairs": stairs,
        "rooms": rooms,
        "shafts": shafts_out,
        "trees": trees,
    }
    if apartments:
        plan["apartments"] = apartments
    if zones:
        plan["zones"] = zones
    if bays:
        plan["bays"] = bays
    if capacity is not None:
        plan["parkingCapacity"] = capacity
    if columns_out:
        plan["columns"] = columns_out
    notes["bays"] = len(bays)
    notes["bays_labelled"] = sum(1 for b in bays if "label" in b)
    notes["parkingCapacity"] = capacity
    zone_areas: dict[str, list[float]] = defaultdict(list)
    for z in zones:
        zone_areas[z["kind"]].append(round(Polygon(z["ring"]).area, 1))
    notes["zones"] = dict(zone_areas)
    notes["columns"] = len(columns_out)
    notes["columns_round"] = sum(1 for c in columns_out if c.get("round"))
    notes["dropped"] = dict(dropped)
    notes["footprint_area"] = round(footprint_area, 1)
    notes["wallPolyHoles"] = sum(len(w.get("holes", [])) for w in wall_polys_out)
    notes["room_parts"] = len(room_parts)
    notes["rooms_with_ring"] = sum(1 for r in rooms if "ring" in r)
    notes["rooms_with_apartment"] = sum(1 for r in rooms if "apartment" in r)
    notes["apartments"] = [code for code, _b, _x, _y in uniq_tags]   # codes drawn as tags (registry_check)
    notes["apartments_emitted"] = [a["code"] for a in apartments]
    notes["outlines"] = [round(g.area, 1) for g in outlines]
    notes["rooms_split"] = len(split_rooms)
    drawn = {code for code, _b, _x, _y in apt_raw} | {b["label"] for b in bays if "label" in b}
    notes["codes_normalised"] = {k: v for k, v in CODE_NORMALISED.items() if v in drawn}
    return plan, notes


def dedupe_segs(segs: list[list[float]]) -> list[list[float]]:
    seen = set()
    out = []
    for s in segs:
        a, b = (s[0], s[1]), (s[2], s[3])
        key = (a, b) if a <= b else (b, a)
        if key in seen or a == b:
            continue
        seen.add(key)
        out.append(s)
    return out


def registry_check(level: str, found: list[str], registry: dict[int, list[str]]) -> dict:
    """Which registered codes for this floor were drawn on the sheet, which were not, and extras."""
    floor = FLOOR_OF_LEVEL.get(level)
    if floor is None:
        return {"floor": None, "registered": [], "found": [], "missing": [], "unregistered": sorted(found)}
    registered = registry.get(floor, [])
    return {
        "floor": floor,
        "registered": registered,
        "found": [c for c in registered if c in found],
        "missing": [c for c in registered if c not in found],
        "unregistered": [c for c in found if c not in registered],
    }


def main() -> None:
    dxf_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DXF_DIR
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT_DIR
    only = set(sys.argv[3].split(",")) if len(sys.argv) > 3 else None
    out_dir.mkdir(parents=True, exist_ok=True)
    registry = load_registry()
    manifest_path = out_dir / "manifest.3d.json"
    summary = []
    for dxf_path in sorted(dxf_dir.glob("*.dxf")):
        level = LEVEL_IDS.get(dxf_path.stem)
        if level is None:
            print(f"skip (unknown sheet): {dxf_path.name}")
            continue
        if only is not None and level not in only:
            continue
        try:
            plan, notes = extract(dxf_path, level)
        except Exception as exc:
            import traceback
            traceback.print_exc()
            print(f"ERR level-{level}: {exc}")
            continue
        out_path = out_dir / f"level-{level}.3d.json"
        out_path.write_text(json.dumps(plan, separators=(",", ":")), encoding="utf-8")
        counts = {k: len(plan[k]) for k in ("footprint", "wallPolys", "wallLines", "windows", "doors", "furniture", "stairs", "rooms", "shafts", "trees")}
        counts["apartments"] = len(plan.get("apartments", []))
        counts["zones"] = len(plan.get("zones", []))
        counts["bays"] = len(plan.get("bays", []))
        counts["columns"] = len(plan.get("columns", []))
        kinds = Counter(f["kind"] for f in plan["furniture"])
        check = registry_check(level, notes["apartments"], registry)
        notes["registry"] = check
        line = (f"level-{level:>2}: {out_path.stat().st_size // 1024:4d} KB  bbox={plan['bbox']}  "
                f"footprint={notes['footprint_area']} m2 ({counts['footprint']} rings)  "
                f"wallPolys={counts['wallPolys']} (+{notes['wallPolyHoles']} holes)  wallLines={counts['wallLines']}  "
                f"windows={counts['windows']}  doors={counts['doors']} (closers {notes['door_closers']})  "
                f"furniture={counts['furniture']} {dict(kinds)}  stairs={counts['stairs']}  "
                f"rooms={counts['rooms']} (rings {notes['rooms_with_ring']}, parts {notes['room_parts']}, "
                f"with apt {notes['rooms_with_apartment']})  apartments={notes['apartments']}  "
                f"shafts={counts['shafts']}  trees={counts['trees']}\n"
                f"           bays={notes['bays']} (labelled {notes['bays_labelled']})  capacity={notes['parkingCapacity']}  "
                f"zones={ {k: f'{len(v)}x {sum(v):.0f}m2' for k, v in notes['zones'].items()} }  "
                f"columns={notes['columns']} (round {notes['columns_round']})")
        if notes.get("capacity_notes"):
            line += f"  [capacity notes disagree: {notes['capacity_notes']}]"
        if notes.get("hatch_fallback"):
            line += "  [NO HATCH WALLS - wallLines only]"
        if notes.get("footprint_fallback"):
            line += f"  [footprint fallback: {notes['footprint_fallback']}]"
        if notes.get("scale") != 1.0:
            line += f"  [scaled x{notes['scale']}]"
        if notes.get("smb_in_place"):
            line += "  [SMB set in place - furniture kept]"
        line += f"  dropped={notes['dropped']}"
        if check["floor"] is not None:
            line += f"\n           registry floor {check['floor']}: found={check['found']} missing={check['missing']}"
            if check["unregistered"]:
                line += f" unregistered={check['unregistered']}"
        elif check["unregistered"]:
            line += f"\n           (no registered units on this level) tags drawn={check['unregistered']}"
        part = notes.get("partition") or {}
        if part.get("codes"):
            line += f"\n           partition: transfer={part.get('transfer')} regions={part.get('regionSource')} doorEdges={part.get('doorEdges')}"
            for code, info in part["codes"].items():
                line += (f"\n             {code:>8}: {info.get('source')} pieces={info.get('pieces')} rooms={info.get('rooms')} "
                         f"area={info.get('areaSqm')} outdoor={info.get('outdoorSqm')} unlabelled={info.get('unlabelledSqm')} "
                         f"coverage={info.get('coverage')} complete={info.get('complete')} {info.get('incomplete') or ''}")
            if part.get("unassigned"):
                line += f"\n             unassigned ({len(part['unassigned'])}): {part['unassigned'][:10]}"
            if part.get("conflicts"):
                line += f"\n             CONFLICTS: {part['conflicts']}"
            if part.get("missing"):
                line += f"\n             missing entries: {part['missing']}"
        print(line)
        summary.append({"level": level, "bytes": out_path.stat().st_size, "counts": counts, "bbox": plan["bbox"], **{k: v for k, v in notes.items()}})
    done = {e["level"] for e in summary}
    if only is not None:  # a partial run updates the existing manifest in place
        try:
            summary += [e for e in json.loads(manifest_path.read_text(encoding="utf-8")) if e.get("level") not in done]
        except Exception:
            pass
    order = {lv: i for i, lv in enumerate(LEVEL_IDS.values())}
    summary.sort(key=lambda e: order.get(e.get("level"), 99))
    manifest_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
