"""
Generate the home-screen / PWA / Apple touch icons from the 3D compass logo.

The raw public/logo.png (286x217, transparent, compass edge-to-edge) is great
for in-app use but bad as an OS icon: iOS and Android crop icons into a rounded
squircle/circle, and because the compass is non-square and touches the edges the
rounding clips its rim ("cut off" look on the home screen).

This composites the compass — centered, padded, on an opaque dark square that
matches the app splash (#0d1319) — into proper square icons:

  - icon-192.png / icon-512.png  : purpose "any"
  - icon-maskable.png (512)      : purpose "maskable" (extra padding = safe zone)
  - apple-touch-icon.png (180)   : iOS home screen
  - favicon-48.png               : browser tab

logo.png itself is left untouched (still used across the in-app UI).

Run:  python scripts/generate-icons.py
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

# Dark surface used by the splash + app theme, so icon/splash/app are cohesive.
BG = (13, 19, 25, 255)  # #0d1319

# Fraction of the square the compass spans (by its larger dimension).
# maskable needs to stay inside the center 80% "safe zone", so it gets more
# padding; "any"/apple are only corner-rounded, so the compass can be larger.
RATIO_ANY = 0.72
RATIO_MASKABLE = 0.60


def load_compass() -> Image.Image:
    im = Image.open(PUBLIC / "logo.png").convert("RGBA")
    bbox = im.getbbox()  # trim transparent border so centering is exact
    return im.crop(bbox)


def make_icon(compass: Image.Image, size: int, ratio: float) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), BG)
    cw, ch = compass.size
    target = int(size * ratio)
    scale = target / max(cw, ch)
    nw, nh = max(1, round(cw * scale)), max(1, round(ch * scale))
    resized = compass.resize((nw, nh), Image.LANCZOS)
    pos = ((size - nw) // 2, (size - nh) // 2)
    canvas.alpha_composite(resized, pos)
    return canvas


def save(img: Image.Image, name: str) -> None:
    out = PUBLIC / name
    img.save(out, "PNG")
    print(f"  wrote {name} ({img.size[0]}x{img.size[1]})")


def main() -> None:
    compass = load_compass()
    print(f"compass content: {compass.size}")
    save(make_icon(compass, 192, RATIO_ANY), "icon-192.png")
    save(make_icon(compass, 512, RATIO_ANY), "icon-512.png")
    save(make_icon(compass, 512, RATIO_MASKABLE), "icon-maskable.png")
    save(make_icon(compass, 180, RATIO_ANY), "apple-touch-icon.png")
    save(make_icon(compass, 48, RATIO_ANY), "favicon-48.png")


if __name__ == "__main__":
    main()
