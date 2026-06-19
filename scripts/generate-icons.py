"""
Generate every app icon from the master compass logo (scripts/logo-master.png).

One source of truth -> all derived assets:

  public/logo.png            : in-app brand image (transparent, 512), used across
                               the UI (login, habits, loader, notifications...).
  public/icon-192.png        : PWA icon, purpose "any"
  public/icon-512.png        : PWA icon, purpose "any"
  public/icon-maskable.png   : PWA icon, purpose "maskable" (extra safe-zone pad)
  public/apple-touch-icon.png: iOS home screen (180)
  public/favicon-48.png      : browser tab

The OS-icon variants composite the compass — centered, padded — onto an opaque
dark square (#0d1319) so the home-screen icon matches the splash + dark app, and
so iOS/Android rounding never clips the compass. logo.png stays transparent for
flexible in-app placement.

To swap the brand later: drop a new square PNG at scripts/logo-master.png and
rerun.  python scripts/generate-icons.py
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
MASTER = Path(__file__).resolve().parent / "logo-master.png"

# Dark surface used by the splash + app theme, so icon/splash/app stay cohesive.
BG = (13, 19, 25, 255)  # #0d1319

# Fraction of the square the compass spans (by its larger dimension).
RATIO_INAPP = 0.99      # logo.png: essentially full-bleed, transparent
RATIO_ANY = 0.82        # home-screen / apple: small breathing margin
RATIO_MASKABLE = 0.66   # stay well inside the center-80% safe zone


def load_compass() -> Image.Image:
    im = Image.open(MASTER).convert("RGBA")
    bbox = im.getbbox()  # trim transparent border so centering is exact
    return im.crop(bbox)


def make_icon(compass: Image.Image, size: int, ratio: float, bg) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg if bg else (0, 0, 0, 0))
    cw, ch = compass.size
    target = int(size * ratio)
    scale = target / max(cw, ch)
    nw, nh = max(1, round(cw * scale)), max(1, round(ch * scale))
    resized = compass.resize((nw, nh), Image.LANCZOS)
    pos = ((size - nw) // 2, (size - nh) // 2)
    canvas.alpha_composite(resized, pos)
    return canvas


def save(img: Image.Image, name: str) -> None:
    img.save(PUBLIC / name, "PNG")
    print(f"  wrote {name} ({img.size[0]}x{img.size[1]})")


def main() -> None:
    compass = load_compass()
    print(f"compass content: {compass.size}")
    # In-app brand: transparent, full-bleed.
    save(make_icon(compass, 512, RATIO_INAPP, None), "logo.png")
    # OS icons: padded on the dark splash color.
    save(make_icon(compass, 192, RATIO_ANY, BG), "icon-192.png")
    save(make_icon(compass, 512, RATIO_ANY, BG), "icon-512.png")
    save(make_icon(compass, 512, RATIO_MASKABLE, BG), "icon-maskable.png")
    save(make_icon(compass, 180, RATIO_ANY, BG), "apple-touch-icon.png")
    save(make_icon(compass, 48, RATIO_ANY, BG), "favicon-48.png")


if __name__ == "__main__":
    main()
