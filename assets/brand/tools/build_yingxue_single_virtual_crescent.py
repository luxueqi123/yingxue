from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from build_yingxue_refined_lunar_composites import ROOT, make_wordmark_layer


CONCEPT_DIR = ROOT / "assets/brand/concepts/2026-08-24/single-diagonal-crescent"
SIZE = 1024


VARIANTS = (
    ("virtual-crescent-raw-1.png", "yingxue-virtual-crescent-a.png", -22.0, 940, (-6, 2), 1.06),
    ("virtual-crescent-raw-2.png", "yingxue-virtual-crescent-b.png", -27.0, 925, (2, -2), 0.96),
    ("virtual-crescent-raw-3.png", "yingxue-virtual-crescent-c.png", -18.0, 930, (8, 0), 0.98),
)


def smoothstep(edge0: float, edge1: float, value: np.ndarray) -> np.ndarray:
    normalized = np.clip((value - edge0) / (edge1 - edge0), 0.0, 1.0)
    return normalized * normalized * (3.0 - 2.0 * normalized)


def extract_virtual_crescent(path: Path, strength: float) -> Image.Image:
    source = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    height, width = source.shape[:2]
    luminance = 0.2126 * source[..., 0] + 0.7152 * source[..., 1] + 0.0722 * source[..., 2]

    alpha = smoothstep(4.0, 62.0, luminance)
    alpha *= np.clip(luminance / 118.0, 0.12, 1.0)
    alpha = np.clip(alpha * strength, 0.0, 0.94)

    cool = source.copy()
    cool[..., 0] *= 0.78
    cool[..., 1] *= 0.94
    cool[..., 2] *= 1.10
    highlight = smoothstep(92.0, 218.0, luminance)[..., None]
    cool += highlight * np.array((10.0, 18.0, 26.0), dtype=np.float32)

    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    rgba[..., :3] = np.clip(cool, 0.0, 255.0).astype(np.uint8)
    rgba[..., 3] = np.round(alpha * 255.0).astype(np.uint8)
    image = Image.fromarray(rgba, "RGBA")

    alpha_image = image.getchannel("A")
    bounds = alpha_image.point(lambda value: 255 if value >= 8 else 0).getbbox()
    if bounds is None:
        raise RuntimeError(f"Unable to isolate virtual crescent from {path}")
    left, top, right, bottom = bounds
    margin = 14
    return image.crop(
        (
            max(0, left - margin),
            max(0, top - margin),
            min(width, right + margin),
            min(height, bottom + margin),
        )
    )


def tint_wordmark(layer: Image.Image) -> Image.Image:
    rgba = np.asarray(layer, dtype=np.float32).copy()
    alpha = rgba[..., 3:4] / 255.0
    cool = rgba[..., :3]
    cool[..., 0] *= 0.82
    cool[..., 1] *= 0.94
    cool[..., 2] *= 1.07
    cool += alpha * np.array((2.0, 7.0, 13.0), dtype=np.float32)
    rgba[..., :3] = np.clip(cool, 0.0, 255.0)
    return Image.fromarray(rgba.astype(np.uint8), "RGBA")


def compose(
    source_name: str,
    output_name: str,
    angle: float,
    max_extent: int,
    offset: tuple[int, int],
    strength: float,
) -> Image.Image:
    crescent = extract_virtual_crescent(CONCEPT_DIR / source_name, strength)
    crescent = crescent.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    crescent.thumbnail((max_extent, max_extent), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (SIZE, SIZE), (2, 7, 14, 255))
    x = (SIZE - crescent.width) // 2 + offset[0]
    y = (SIZE - crescent.height) // 2 + offset[1]
    canvas.alpha_composite(crescent, (x, y))

    wordmark = tint_wordmark(make_wordmark_layer(650, 371))
    canvas = Image.alpha_composite(canvas, wordmark)
    output = canvas.convert("RGB")
    output.save(CONCEPT_DIR / output_name, quality=98)
    return output


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    paths = (
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/msyh.ttc",
    )
    for path in paths:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def make_board(images: list[Image.Image]) -> None:
    board = Image.new("RGB", (1400, 2100), (5, 8, 13))
    label_font = load_font(46, True)
    note_font = load_font(25)
    labels = ("A  FLOWING MOON", "B  MIST MOON", "C  FROST MOON")

    for index, (image, label) in enumerate(zip(images, labels)):
        card = Image.new("RGB", (1400, 700), (6, 10, 16))
        display = image.resize((570, 570), Image.Resampling.LANCZOS)
        card.paste(display, (415, 36))
        draw = ImageDraw.Draw(card)
        draw.text((34, 28), label, font=label_font, fill=(220, 231, 238))
        draw.text((35, 90), "80 px check", font=note_font, fill=(102, 126, 143))
        thumb = image.resize((80, 80), Image.Resampling.LANCZOS)
        card.paste(thumb, (42, 135))
        draw.rectangle((40, 133, 124, 217), outline=(42, 63, 77), width=2)
        board.paste(card, (0, index * 700))

    board.save(CONCEPT_DIR / "yingxue-single-virtual-crescent-board.jpg", quality=97)


def build_centered_diagonal_final() -> None:
    crescent = extract_virtual_crescent(CONCEPT_DIR / "virtual-crescent-raw-1.png", 1.16)
    crescent = crescent.rotate(7.0, resample=Image.Resampling.BICUBIC, expand=True)
    crescent.thumbnail((830, 830), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (SIZE, SIZE), (2, 7, 14, 255))
    crescent_x = (SIZE - crescent.width) // 2
    crescent_y = (SIZE - crescent.height) // 2 + 2
    canvas.alpha_composite(crescent, (crescent_x, crescent_y))

    wordmark = tint_wordmark(make_wordmark_layer(580, 400))
    canvas = Image.alpha_composite(canvas, wordmark)
    output = canvas.convert("RGB")
    output.save(CONCEPT_DIR / "yingxue-centered-diagonal-halfmoon.png", quality=98)

    preview = Image.new("RGB", (1400, 760), (5, 8, 13))
    display = output.resize((620, 620), Image.Resampling.LANCZOS)
    preview.paste(display, (390, 36))
    draw = ImageDraw.Draw(preview)
    draw.text((34, 30), "CENTERED DIAGONAL HALF-MOON", font=load_font(42, True), fill=(220, 231, 238))
    draw.text((35, 94), "80 px check", font=load_font(25), fill=(102, 126, 143))
    thumb = output.resize((80, 80), Image.Resampling.LANCZOS)
    preview.paste(thumb, (42, 138))
    draw.rectangle((40, 136, 124, 220), outline=(42, 63, 77), width=2)
    preview.save(CONCEPT_DIR / "yingxue-centered-diagonal-halfmoon-preview.jpg", quality=97)


def main() -> None:
    images = [compose(*variant) for variant in VARIANTS]
    make_board(images)
    build_centered_diagonal_final()


if __name__ == "__main__":
    main()
