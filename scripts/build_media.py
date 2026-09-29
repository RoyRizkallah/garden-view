"""Build the web media for the gallery from the client's photoshoot folder.

The shoot arrives as one flat folder of camera JPEGs and 20 Mbit/s 50 fps masters:

    Block A.1.JPG.jpeg … Block A_FHD.mp4
    Common spaces + Safety.1.JPG.jpeg … Common spaces + Safety.mp4
    Gym.1.JPG.jpeg … Gym_FHD.mp4

For every photo this writes WebP variants (480/960/1440/1920 wide, capped at the source) plus
one JPEG fallback into web/public/images/shoot/. For every film it writes a 1080p and a 720p
H.264 encode with the soundtrack (web/public/media/), an 8-second silent preview that loops
seamlessly (its tail cross-fades into its own head), and a poster taken from the preview's
first frame so the still and the moving picture never jump. Everything the site needs to
know — pixel sizes, variant widths, durations — goes to web/src/data/photoshoot-media.json.

Captions and ordering live in web/src/data/photoshoot.ts, not here: this script only knows
about pixels.

    python scripts/build_media.py [--src "D:/garden view/Photoshoot"] [--only photos|films|avif] [--sets block-c,gym]
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
IMG_OUT = WEB / "public" / "images" / "shoot"
VID_OUT = WEB / "public" / "media"
MANIFEST = WEB / "src" / "data" / "photoshoot-media.json"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

# file-name prefix in the shoot folder → slug on the site
SETS = {
    "Block A": "block-a",
    "Block B": "block-b",
    "Block C": "block-c",
    "Common spaces + Safety": "common",
    "Gym": "gym",
}

# Where each film's silent preview is cut from (seconds into the master). Picked by eye from
# per-second frames: a steady, well-lit move that says what the chapter is about, starting on a
# frame that works as the poster. The common-spaces film is kept clear of 0:09–0:18, which walks
# through an unfinished shell space; Block C clear of the blank shopfront wall at 0:27–0:30.
LOOP_START = {"block-a": 2.0, "block-b": 0.5, "block-c": 31.0, "common": 26.0, "gym": 37.0}
LOOP_LEN = 8.0
LOOP_XFADE = 1.0

WIDTHS = (480, 960, 1440, 1920)
AVIF_Q = 58


def run(cmd: list[str]) -> None:
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        sys.stderr.write(res.stderr[-3000:])
        raise SystemExit(f"ffmpeg failed: {' '.join(cmd[:6])} …")


def probe_duration(path: Path) -> float:
    res = subprocess.run([FFMPEG, "-hide_banner", "-i", str(path)], capture_output=True, text=True)
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", res.stderr)
    if not m:
        raise SystemExit(f"could not read duration of {path.name}")
    h, mi, s = m.groups()
    return round(int(h) * 3600 + int(mi) * 60 + float(s), 2)


def write_photo(im: Image.Image, name: str) -> dict:
    """AVIF + WebP variants and a JPEG fallback for one image; returns its manifest entry."""
    im = ImageOps.exif_transpose(im).convert("RGB")
    # a few masters are 4K; nothing on the site is ever drawn wider than 1920 CSS px × DPR 1
    if im.width > WIDTHS[-1]:
        im = im.resize((WIDTHS[-1], round(im.height * WIDTHS[-1] / im.width)), Image.LANCZOS)
    variants = []
    for w in WIDTHS:
        real = min(w, im.width)
        if variants and variants[-1][0] == real:
            break
        v = im if real == im.width else im.resize((real, round(im.height * real / im.width)), Image.LANCZOS)
        if real < im.width:
            # downscaling softens; a light unsharp brings back stone texture and window mullions
            v = v.filter(ImageFilter.UnsharpMask(radius=0.8, percent=45, threshold=2))
        v.save(IMG_OUT / f"{name}-{w}.webp", "WEBP", quality=80, method=6)
        # AVIF at q58 matches the WebP by eye at ~60% of the bytes; browsers that can decode it take it
        v.save(IMG_OUT / f"{name}-{w}.avif", "AVIF", quality=AVIF_Q, speed=4)
        variants.append([real, str(w)])
        if real == im.width:
            break
    # fallback for the rare browser without WebP: one mid-size progressive JPEG
    fb = im if im.width <= 1440 else im.resize((1440, round(im.height * 1440 / im.width)), Image.LANCZOS)
    fb.save(IMG_OUT / f"{name}.jpg", "JPEG", quality=80, progressive=True, optimize=True)
    return {"w": im.width, "h": im.height, "v": variants}


def build_photos(src: Path) -> dict:
    IMG_OUT.mkdir(parents=True, exist_ok=True)
    out: dict = {}
    for f in sorted(src.glob("*.jpeg")) + sorted(src.glob("*.jpg")):
        m = re.match(r"(.+)\.(\d+)\.JPG\.jpe?g$", f.name, re.I) or re.match(r"(.+)\.(\d+)\.jpe?g$", f.name, re.I)
        if not m or m.group(1) not in SETS:
            print(f"  skip {f.name} (not a known set)")
            continue
        name = f"{SETS[m.group(1)]}-{int(m.group(2))}"
        out[name] = write_photo(Image.open(f), name)
        print(f"  photo {name}  {out[name]["w"]}x{out[name]["h"]}")
    return out


def film_master(src: Path, prefix: str) -> Path | None:
    for cand in (f"{prefix}_FHD.mp4", f"{prefix}.mp4"):
        if (src / cand).exists():
            return src / cand
    return None


def build_films(src: Path, only: set[str] | None = None) -> tuple[dict, dict]:
    VID_OUT.mkdir(parents=True, exist_ok=True)
    films: dict = {}
    posters: dict = {}
    for prefix, slug in SETS.items():
        master = film_master(src, prefix)
        if not master or (only and slug not in only):
            continue
        duration = probe_duration(master)
        print(f"  film {slug}  {duration}s  from {master.name}")

        # Full films: 50 → 25 fps is a clean halving, and the soundtrack stays.
        for height, crf, maxrate in ((1080, 23, "5M"), (720, 24, "2500k")):
            run([
                FFMPEG, "-y", "-hide_banner", "-i", str(master),
                "-vf", f"fps=25,scale=-2:{height}:flags=lanczos",
                "-c:v", "libx264", "-preset", "slow", "-crf", str(crf),
                "-maxrate", maxrate, "-bufsize", str(int(maxrate.rstrip("Mk")) * 2) + maxrate[-1],
                "-profile:v", "high", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
                "-movflags", "+faststart",
                str(VID_OUT / f"{slug}-{height}.mp4"),
            ])

        # Silent preview (xfade insists on an explicit constant rate after the trims): cut LOOP_LEN + LOOP_XFADE seconds, then cross-fade the tail into the
        # head so the last frame lands on the first one and the loop has no seam.
        start, L, F = LOOP_START[slug], LOOP_LEN, LOOP_XFADE
        graph = (
            f"[0:v]fps=25,scale=1280:-2:flags=lanczos,setpts=PTS-STARTPTS,split[a][b];"
            f"[a]trim=start={F}:duration={L},setpts=PTS-STARTPTS,fps=25[main];"
            f"[b]trim=start=0:duration={F},setpts=PTS-STARTPTS,fps=25[head];"
            f"[main][head]xfade=transition=fade:duration={F}:offset={L - F},format=yuv420p[v]"
        )
        run([
            FFMPEG, "-y", "-hide_banner", "-ss", str(start), "-t", str(L + F + 0.2), "-i", str(master),
            "-filter_complex", graph, "-map", "[v]", "-an",
            "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-maxrate", "2500k", "-bufsize", "5000k",
            "-profile:v", "high", "-movflags", "+faststart",
            str(VID_OUT / f"{slug}-loop.mp4"),
        ])

        # Poster = the preview's first frame (source time start + F), full resolution.
        with tempfile.TemporaryDirectory() as tmp:
            png = Path(tmp) / "poster.png"
            run([FFMPEG, "-y", "-hide_banner", "-ss", str(start + F), "-i", str(master), "-frames:v", "1", str(png)])
            posters[f"film-{slug}"] = write_photo(Image.open(png), f"film-{slug}")

        films[slug] = {
            "duration": duration,
            "poster": f"/images/shoot/film-{slug}.jpg",
            "loop": f"/media/{slug}-loop.mp4",
            "sources": [
                {"src": f"/media/{slug}-720.mp4", "media": "(max-width: 900px)"},
                {"src": f"/media/{slug}-1080.mp4"},
            ],
        }
    return films, posters


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="D:/garden view/Photoshoot")
    ap.add_argument("--only", choices=["photos", "films", "avif"])
    ap.add_argument("--sets", help="comma-separated film slugs to rebuild, e.g. block-c,gym")
    args = ap.parse_args()
    src = Path(args.src)
    if not src.is_dir():
        raise SystemExit(f"shoot folder not found: {src}")

    manifest = json.loads(MANIFEST.read_text("utf-8")) if MANIFEST.exists() else {"photos": {}, "films": {}}
    if args.only == "avif":
        # add AVIF siblings to every WebP variant already built, from the largest WebP (posters)
        # or the original photo (shoot images)
        print("avif:")
        for f in sorted(src.glob("*.jpeg")) + sorted(src.glob("*.jpg")):
            m = re.match(r"(.+)\.(\d+)\.JPG\.jpe?g$", f.name, re.I) or re.match(r"(.+)\.(\d+)\.jpe?g$", f.name, re.I)
            if m and m.group(1) in SETS:
                name = f"{SETS[m.group(1)]}-{int(m.group(2))}"
                manifest["photos"][name] = write_photo(Image.open(f), name)
                print(f"  {name}")
        for name, meta in manifest["photos"].items():
            if name.startswith("film-"):
                largest = IMG_OUT / f"{name}-{meta['v'][-1][1]}.webp"
                write_photo(Image.open(largest), name)
                print(f"  {name}")
        MANIFEST.write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n", "utf-8")
        return
    if args.only != "films":
        print("photos:")
        manifest["photos"].update(build_photos(src))
    if args.only != "photos":
        print("films:")
        films, posters = build_films(src, set(args.sets.split(",")) if args.sets else None)
        manifest["films"].update(films)
        manifest["photos"].update(posters)

    MANIFEST.write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n", "utf-8")
    print(f"wrote {MANIFEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
