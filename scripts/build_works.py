"""Build the web images for the works shown before and after on the residents' Project Progress page.

The building management sends phone photos (JPEG, any orientation, often 4000 px wide). For each
photo listed in scripts/works-sources.json this writes two WebP files into
web/public/images/works/: <slug>-640.webp for the cards and <slug>-1600.webp for the enlarged
view (both capped at the source width, turned upright from the EXIF orientation), and records each
photo's size in web/src/data/works-media.json. Captions and grouping live in
web/src/data/works.ts.

    python scripts/build_works.py --src "D:/garden view"
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "scripts" / "works-sources.json"
OUT = ROOT / "web" / "public" / "images" / "works"
MANIFEST = ROOT / "web" / "src" / "data" / "works-media.json"
WIDTHS = (640, 1600)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", required=True, help="folder holding the client's works folders")
    args = parser.parse_args()
    spec = json.loads(SOURCES.read_text(encoding="utf-8"))
    roots = {key: Path(args.src) / rel for key, rel in spec["root"].items()}
    OUT.mkdir(parents=True, exist_ok=True)

    media: dict[str, dict[str, int]] = {}
    for slug, ref in spec["photos"].items():
        key, rel = ref.split("/", 1)
        source = roots[key] / rel
        image = ImageOps.exif_transpose(Image.open(source)).convert("RGB")
        for width in WIDTHS:
            copy = image.copy()
            if copy.width > width:
                copy = copy.resize((width, round(copy.height * width / copy.width)), Image.LANCZOS)
            copy.save(OUT / f"{slug}-{width}.webp", "WEBP", quality=76, method=6)
        media[slug] = {"w": image.width, "h": image.height}
        print(f"{slug}: {image.width}x{image.height}")

    MANIFEST.write_text(json.dumps(media, indent=1) + "\n", encoding="utf-8", newline="\n")
    total = sum(f.stat().st_size for f in OUT.glob("*.webp"))
    print(f"{len(media)} photos, {total / 1024 / 1024:.1f} MB of WebP")


if __name__ == "__main__":
    main()
