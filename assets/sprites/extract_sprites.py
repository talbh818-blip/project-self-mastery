"""
Crop a Sasuke evolution sprite sheet into per-character transparent PNGs.

Input:  assets/sprites/sasuke-sheet.png  (3 rows of characters on cracked-stone bg)
Output: public/sprites/sasuke-01.png ... sasuke-NN.png  (numbered left-to-right,
        top-to-bottom, i.e. evolution order: 01 = youngest -> NN = most evolved)

Pipeline per cell:
  1. Detect horizontal row separators (bright white grid lines).
  2. Within each row band, detect vertical column separators the same way.
  3. Crop each cell with a small inset to drop any leftover grid line.
  4. Run rembg (AI bg removal) to get a clean transparent character.
  5. Trim transparent margins so each PNG is tightly cropped.
"""

from __future__ import annotations

from pathlib import Path
import sys

from PIL import Image
import numpy as np
from rembg import new_session, remove

ROOT = Path(__file__).resolve().parents[2]
SRC_CANDIDATES = [
    ROOT / "assets" / "sprites" / "sasuke-sheet.png",
    ROOT / "assets" / "sprites" / "sasuke-sheet.jpg",
]
SRC = next((p for p in SRC_CANDIDATES if p.exists()), SRC_CANDIDATES[0])
OUT = ROOT / "public" / "sprites"
OUT.mkdir(parents=True, exist_ok=True)

# How "white" a pixel must be to count as part of a grid line.
WHITE_THRESHOLD = 220
# A row/col is a "separator" if at least this fraction of its pixels are white.
# Lowered for column detection so we can catch thinner separators between chars.
ROW_SEP_RATIO = 0.85
COL_SEP_RATIO = 0.55
# Inset (px) shaved off each side of a cell to drop any remaining grid pixels.
CELL_INSET = 2
# Min cell size, in pixels — drop sub-threshold blobs (likely noise between gridlines).
MIN_CELL_W = 40
MIN_CELL_H = 60
# rembg model — isnet-general-use handles complex backgrounds + low-contrast
# characters substantially better than u2net.
REMBG_MODEL = "isnet-general-use"


def find_separator_runs(mask_1d: np.ndarray) -> list[tuple[int, int]]:
    """Given a 1-D bool array (True = separator), return (start, end) runs of True.
    Used to find the bands of cells *between* separators by inverting later.
    """
    runs: list[tuple[int, int]] = []
    in_run = False
    start = 0
    for i, v in enumerate(mask_1d):
        if v and not in_run:
            in_run = True
            start = i
        elif not v and in_run:
            in_run = False
            runs.append((start, i))
    if in_run:
        runs.append((start, len(mask_1d)))
    return runs


def find_content_bands(mask_1d: np.ndarray) -> list[tuple[int, int]]:
    """Return (start, end) ranges along the axis where content lives
    (i.e. *between* separator runs, with the image edges included)."""
    sep_runs = find_separator_runs(mask_1d)
    bands: list[tuple[int, int]] = []
    cursor = 0
    for s, e in sep_runs:
        if s > cursor:
            bands.append((cursor, s))
        cursor = e
    if cursor < len(mask_1d):
        bands.append((cursor, len(mask_1d)))
    return bands


def content_ratio(im: Image.Image) -> float:
    """Fraction of pixels that are clearly opaque (alpha > 180). Pixels
    with low/medium alpha indicate the bg remover is uncertain — typically
    a sign it has eaten parts of the character (e.g. white cloaks). Using
    a high threshold catches these "washy" failures, not just total wipeouts.
    """
    if im.mode != "RGBA":
        return 1.0
    alpha = np.array(im)[:, :, 3]
    if alpha.size == 0:
        return 0.0
    return float((alpha > 180).sum()) / float(alpha.size)


def chroma_key_remove(cell_rgb: Image.Image) -> Image.Image:
    """Fallback bg removal: sample bg color from the 4 corners, then erase
    pixels whose Lab-ish distance to any bg sample is small. Works well on
    the consistent cracked-stone blue background — preserves characters
    that rembg's AI model wrongly erased (e.g. white/silver cloaks).
    """
    arr = np.array(cell_rgb).astype(np.int16)
    h, w, _ = arr.shape
    # Corner patches as bg samples (10% of each side).
    ph = max(4, h // 10)
    pw = max(4, w // 10)
    patches = [
        arr[:ph, :pw, :],
        arr[:ph, -pw:, :],
        arr[-ph:, :pw, :],
        arr[-ph:, -pw:, :],
    ]
    samples = np.concatenate([p.reshape(-1, 3) for p in patches], axis=0)
    # Reduce to ~16 representative bg colors via simple bucket-mean.
    buckets: dict[tuple[int, int, int], list[np.ndarray]] = {}
    for px in samples:
        key = (int(px[0]) // 16, int(px[1]) // 16, int(px[2]) // 16)
        buckets.setdefault(key, []).append(px)
    bg_colors = np.array(
        [np.mean(np.stack(v), axis=0) for v in buckets.values()],
        dtype=np.int16,
    )

    # Distance of every pixel to its nearest bg color (squared euclidean in RGB).
    flat = arr.reshape(-1, 3)  # (N, 3)
    # (N, K) distances:
    d2 = ((flat[:, None, :] - bg_colors[None, :, :]) ** 2).sum(axis=2)
    nearest = d2.min(axis=1)
    # Threshold: anything within ~35 RGB units of bg gets erased.
    bg_mask = (nearest < (35 ** 2)).reshape(h, w)

    alpha = np.where(bg_mask, 0, 255).astype(np.uint8)
    out = np.dstack([arr.astype(np.uint8), alpha])
    return Image.fromarray(out, mode="RGBA")


def auto_crop_alpha(im: Image.Image) -> Image.Image:
    """Trim fully-transparent margins. Returns original if no alpha."""
    if im.mode != "RGBA":
        return im
    alpha = np.array(im)[:, :, 3]
    if not alpha.any():
        return im
    rows = np.where(alpha.any(axis=1))[0]
    cols = np.where(alpha.any(axis=0))[0]
    top, bottom = rows[0], rows[-1] + 1
    left, right = cols[0], cols[-1] + 1
    return im.crop((left, top, right, bottom))


def main() -> int:
    if not SRC.exists():
        print(f"ERROR: missing source image at {SRC}", file=sys.stderr)
        return 1

    print(f"Loading sheet: {SRC}")
    sheet = Image.open(SRC).convert("RGB")
    arr = np.array(sheet)
    h, w, _ = arr.shape
    print(f"  size: {w}x{h}")

    # White mask: a pixel counts as "white" if all 3 channels are >= threshold.
    white = (arr >= WHITE_THRESHOLD).all(axis=2)

    # Horizontal separators: rows that are mostly white.
    row_white_ratio = white.mean(axis=1)
    row_sep_mask = row_white_ratio >= ROW_SEP_RATIO
    row_bands = find_content_bands(row_sep_mask)
    row_bands = [(s, e) for s, e in row_bands if (e - s) >= MIN_CELL_H]
    print(f"  rows detected: {len(row_bands)} -> {row_bands}")

    # For each row band, scan vertical separators *within that row*.
    cells: list[tuple[int, int, int, int]] = []  # (left, top, right, bottom) in sheet coords
    for rs, re in row_bands:
        band = white[rs:re, :]
        col_white_ratio = band.mean(axis=0)
        col_sep_mask = col_white_ratio >= COL_SEP_RATIO
        col_bands = find_content_bands(col_sep_mask)
        col_bands = [(s, e) for s, e in col_bands if (e - s) >= MIN_CELL_W]
        print(f"    row [{rs},{re}): {len(col_bands)} cells")
        for cs, ce in col_bands:
            left = cs + CELL_INSET
            right = ce - CELL_INSET
            top = rs + CELL_INSET
            bottom = re - CELL_INSET
            if right - left < MIN_CELL_W or bottom - top < MIN_CELL_H:
                continue
            cells.append((left, top, right, bottom))

    print(f"\nTotal cells: {len(cells)}")
    if not cells:
        print("ERROR: no cells found — check WHITE_THRESHOLD / SEP_RATIO", file=sys.stderr)
        return 2

    # Background removal session (reuse the same ONNX session across cells).
    print(f"Initializing rembg with model={REMBG_MODEL} (downloads model on first run)...")
    session = new_session(REMBG_MODEL)
    # Secondary AI model — birefnet handles light/silver characters that
    # u2net/isnet erroneously eat. We only invoke it when primary AI fails.
    secondary_session = None
    def get_secondary():
        nonlocal secondary_session
        if secondary_session is None:
            print("  (loading secondary model birefnet-general-lite...)")
            secondary_session = new_session("birefnet-general-lite")
        return secondary_session
    print("Done.\n")

    # Minimum content ratio after rembg — below this we assume the model ate
    # the character (often happens with white/silver cloaks) and fall back to
    # the chroma-key sampler.
    MIN_CONTENT_RATIO = 0.15

    for i, (left, top, right, bottom) in enumerate(cells, start=1):
        cell_img = sheet.crop((left, top, right, bottom))
        clean = remove(cell_img, session=session)
        ratio = content_ratio(clean)
        used = "isnet"
        if ratio < MIN_CONTENT_RATIO:
            # Primary AI ate the character. Try birefnet (different architecture).
            alt = remove(cell_img, session=get_secondary())
            alt_ratio = content_ratio(alt)
            if alt_ratio >= MIN_CONTENT_RATIO:
                clean = alt
                used = f"birefnet (isnet ratio={ratio:.2f})"
            else:
                # Both AI models failed — fall back to chroma key.
                clean = chroma_key_remove(cell_img.convert("RGB"))
                used = f"chroma (isnet={ratio:.2f}, birefnet={alt_ratio:.2f})"
        clean = auto_crop_alpha(clean)
        out_path = OUT / f"sasuke-{i:02d}.png"
        clean.save(out_path, format="PNG")
        print(
            f"  {i:02d}/{len(cells)}: {out_path.name}  "
            f"({clean.size[0]}x{clean.size[1]})  [{used}]"
        )

    print(f"\nDone. {len(cells)} sprites written to {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
