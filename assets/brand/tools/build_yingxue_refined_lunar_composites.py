from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[3]
CONCEPT_DIR = ROOT / "assets/brand/concepts/2026-08-24/refined-lunar-composition"
WORDMARK_MASK = ROOT / "assets/brand/previews/yingxue-v5-isolated-wordmark.png"
SIZE = 1024


VARIANTS = (
    (
        "a-veil-and-blade",
        "yingxue-bg-a-veil-and-blade.png",
        "yingxue-refined-a-veil-and-blade.png",
        700,
        354,
        0.84,
        0.78,
    ),
    (
        "b-negative-eclipse",
        "yingxue-bg-b-negative-eclipse.png",
        "yingxue-refined-b-negative-eclipse.png",
        700,
        352,
        0.90,
        0.79,
    ),
    (
        "c-orbit-cut",
        "yingxue-bg-c-orbit-cut.png",
        "yingxue-refined-c-orbit-cut.png",
        680,
        358,
        0.78,
        0.84,
    ),
)


def shift(array: np.ndarray, dx: int, dy: int) -> np.ndarray:
    result = np.zeros_like(array)
    source_x0 = max(0, -dx)
    source_y0 = max(0, -dy)
    source_x1 = min(array.shape[1], array.shape[1] - dx)
    source_y1 = min(array.shape[0], array.shape[0] - dy)
    target_x0 = max(0, dx)
    target_y0 = max(0, dy)
    target_x1 = target_x0 + (source_x1 - source_x0)
    target_y1 = target_y0 + (source_y1 - source_y0)
    if source_x1 > source_x0 and source_y1 > source_y0:
        result[target_y0:target_y1, target_x0:target_x1] = array[
            source_y0:source_y1, source_x0:source_x1
        ]
    return result


def prepare_background(path: Path, strength: float, vertical_scale: float) -> Image.Image:
    image = Image.open(path).convert("RGB").resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    compressed_height = round(SIZE * vertical_scale)
    compressed = image.resize((SIZE, compressed_height), Image.Resampling.LANCZOS)
    image = Image.new("RGB", (SIZE, SIZE), (0, 0, 0))
    image.paste(compressed, (0, (SIZE - compressed_height) // 2))
    rgb = np.asarray(image, dtype=np.float32)
    luminance = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    controlled = rgb * strength
    controlled += np.clip((luminance - 178.0) / 77.0, 0.0, 1.0)[..., None] * 12.0

    yy, xx = np.indices((SIZE, SIZE), dtype=np.float32)
    radius = np.sqrt(((xx - SIZE / 2) / (SIZE * 0.72)) ** 2 + ((yy - SIZE / 2) / (SIZE * 0.72)) ** 2)
    vignette = np.clip(1.06 - 0.24 * radius, 0.78, 1.0)
    controlled *= vignette[..., None]
    controlled = np.clip(controlled, 0.0, 255.0).astype(np.uint8)
    return Image.fromarray(controlled, "RGB").convert("RGBA")


def make_wordmark_layer(target_width: int, top: int) -> Image.Image:
    source_mask = Image.open(WORDMARK_MASK).convert("L")
    target_height = round(source_mask.height * target_width / source_mask.width)
    resized = source_mask.resize((target_width, target_height), Image.Resampling.LANCZOS)
    alpha = np.asarray(resized, dtype=np.float32) / 255.0

    full_alpha = np.zeros((SIZE, SIZE), dtype=np.float32)
    left = (SIZE - target_width) // 2
    full_alpha[top : top + target_height, left : left + target_width] = alpha
    alpha_image = Image.fromarray(np.round(full_alpha * 255.0).astype(np.uint8), "L")

    outer = np.asarray(alpha_image.filter(ImageFilter.MaxFilter(11)), dtype=np.float32) / 255.0
    outline = np.clip(outer - full_alpha, 0.0, 1.0)
    extrusion = np.clip(shift(full_alpha, 8, 9) - full_alpha * 0.96, 0.0, 1.0)
    cast_shadow = alpha_image.filter(ImageFilter.GaussianBlur(14))
    cast_shadow = np.asarray(cast_shadow, dtype=np.float32) / 255.0
    cast_shadow = shift(cast_shadow, 5, 10)

    yy, xx = np.indices((SIZE, SIZE), dtype=np.float32)
    local_y = np.clip((yy - top) / max(1, target_height - 1), 0.0, 1.0)
    stops = (
        (0.00, np.array((250.0, 251.0, 248.0))),
        (0.22, np.array((226.0, 232.0, 235.0))),
        (0.52, np.array((166.0, 180.0, 190.0))),
        (0.72, np.array((237.0, 241.0, 241.0))),
        (1.00, np.array((103.0, 116.0, 130.0))),
    )
    surface = np.zeros((SIZE, SIZE, 3), dtype=np.float32)
    for index in range(len(stops) - 1):
        y0, color0 = stops[index]
        y1, color1 = stops[index + 1]
        weight = np.clip((local_y - y0) / (y1 - y0), 0.0, 1.0)[..., None]
        segment = color0 + (color1 - color0) * weight
        active = ((local_y >= y0) & (local_y <= y1))[..., None]
        surface = np.where(active, segment, surface)

    diagonal = np.exp(-((xx - (SIZE * 0.34 + local_y * SIZE * 0.17)) / 72.0) ** 2)
    surface += diagonal[..., None] * 20.0
    upper_bevel = np.clip(full_alpha - shift(full_alpha, 3, 3), 0.0, 1.0)
    lower_bevel = np.clip(full_alpha - shift(full_alpha, -3, -3), 0.0, 1.0)
    surface += upper_bevel[..., None] * 58.0
    surface *= 1.0 - lower_bevel[..., None] * 0.30

    layer = np.zeros((SIZE, SIZE, 4), dtype=np.uint8)
    shadow_rgba = np.zeros_like(layer)
    shadow_rgba[..., :3] = np.array((0, 0, 0), dtype=np.uint8)
    shadow_rgba[..., 3] = np.round(cast_shadow * 0.72 * 255.0).astype(np.uint8)
    composed = Image.fromarray(shadow_rgba, "RGBA")

    extrusion_rgba = np.zeros_like(layer)
    extrusion_rgba[..., :3] = np.array((24, 31, 40), dtype=np.uint8)
    extrusion_rgba[..., 3] = np.round(extrusion * 0.96 * 255.0).astype(np.uint8)
    composed = Image.alpha_composite(composed, Image.fromarray(extrusion_rgba, "RGBA"))

    outline_rgba = np.zeros_like(layer)
    outline_rgba[..., :3] = np.array((62, 76, 89), dtype=np.uint8)
    outline_rgba[..., 3] = np.round(outline * 0.88 * 255.0).astype(np.uint8)
    composed = Image.alpha_composite(composed, Image.fromarray(outline_rgba, "RGBA"))

    fill_rgba = np.zeros_like(layer)
    fill_rgba[..., :3] = np.clip(surface, 0.0, 255.0).astype(np.uint8)
    fill_rgba[..., 3] = np.round(full_alpha * 255.0).astype(np.uint8)
    return Image.alpha_composite(composed, Image.fromarray(fill_rgba, "RGBA"))


def compose(
    background_name: str,
    output_name: str,
    width: int,
    top: int,
    strength: float,
    vertical_scale: float,
) -> Image.Image:
    background = prepare_background(CONCEPT_DIR / background_name, strength, vertical_scale)
    wordmark = make_wordmark_layer(width, top)
    output = Image.alpha_composite(background, wordmark).convert("RGB")
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
    board = Image.new("RGB", (1400, 2100), (6, 8, 11))
    label_font = load_font(46, bold=True)
    note_font = load_font(25)
    labels = ("A  VEIL / BLADE", "B  NEGATIVE ECLIPSE", "C  ORBIT CUT")

    for index, (image, label) in enumerate(zip(images, labels)):
        card = Image.new("RGB", (1400, 700), (7, 9, 12))
        display = image.resize((570, 570), Image.Resampling.LANCZOS)
        card.paste(display, (415, 38))
        draw = ImageDraw.Draw(card)
        draw.text((34, 28), label, font=label_font, fill=(228, 233, 236))
        draw.text((35, 90), "80 px check", font=note_font, fill=(111, 126, 139))
        thumbnail = image.resize((80, 80), Image.Resampling.LANCZOS)
        card.paste(thumbnail, (42, 135))
        draw.rectangle((40, 133, 124, 217), outline=(48, 59, 70), width=2)
        board.paste(card, (0, index * 700))

    board.save(CONCEPT_DIR / "yingxue-refined-lunar-board.jpg", quality=97)


def main() -> None:
    images: list[Image.Image] = []
    for _, background_name, output_name, width, top, strength, vertical_scale in VARIANTS:
        images.append(compose(background_name, output_name, width, top, strength, vertical_scale))
    make_board(images)


if __name__ == "__main__":
    main()
