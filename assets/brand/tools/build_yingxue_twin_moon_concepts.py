from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from build_reference_led_a_assets import ROOT, shifted
from build_yingxue_clean_v5_assets import extract_clean_wordmark


OUTPUT_DIR = ROOT / "assets/brand/concepts/2026-08-24/twin-moon"
FINAL_SIZE = (1200, 600)
SCALE = 2
WORK_SIZE = (FINAL_SIZE[0] * SCALE, FINAL_SIZE[1] * SCALE)


def crescent_mask(
    bounds: tuple[int, int, int, int],
    opening: str,
    offset: int,
    angle: float,
) -> np.ndarray:
    layer = Image.new("L", WORK_SIZE, 0)
    draw = ImageDraw.Draw(layer)
    scaled = tuple(value * SCALE for value in bounds)
    draw.ellipse(scaled, fill=255)
    left, top, right, bottom = bounds
    inset_x = 74
    inset_y = 48
    shift_x = offset if opening == "right" else -offset
    inner = (
        (left + inset_x + shift_x) * SCALE,
        (top + inset_y) * SCALE,
        (right - inset_x + shift_x) * SCALE,
        (bottom - inset_y) * SCALE,
    )
    draw.ellipse(inner, fill=0)
    center = (((left + right) // 2) * SCALE, ((top + bottom) // 2) * SCALE)
    if angle:
        layer = layer.rotate(angle, resample=Image.Resampling.BICUBIC, center=center)
    return np.asarray(layer, dtype=np.float32) / 255.0


def three_stop_color(
    tone: np.ndarray,
    shadow: tuple[int, int, int],
    middle: tuple[int, int, int],
    highlight: tuple[int, int, int],
) -> np.ndarray:
    low = np.array(shadow, dtype=np.float32)
    mid = np.array(middle, dtype=np.float32)
    high = np.array(highlight, dtype=np.float32)
    low_mix = np.clip(tone * 2.0, 0.0, 1.0)[..., None]
    high_mix = np.clip((tone - 0.5) * 2.0, 0.0, 1.0)[..., None]
    first = low + (mid - low) * low_mix
    second = mid + (high - mid) * high_mix
    return np.where((tone <= 0.5)[..., None], first, second)


def metal_layer(
    mask: np.ndarray,
    palette: tuple[tuple[int, int, int], tuple[int, int, int], tuple[int, int, int]],
    direction: float,
) -> Image.Image:
    height, width = mask.shape
    ys, xs = np.indices(mask.shape)
    vertical = 1.0 - ys / max(1, height - 1)
    horizontal = 1.0 - xs / max(1, width - 1)
    tone = np.clip(0.18 + vertical * 0.58 + horizontal * direction, 0.0, 1.0)
    texture = np.sin(xs * 0.075 + ys * 0.011) * 2.4 + np.sin(xs * 0.021 - ys * 0.027) * 1.5
    rgb = three_stop_color(tone, *palette) + texture[..., None]
    upper_left = np.clip(mask - shifted(mask, 5 * SCALE, 5 * SCALE), 0.0, 1.0)
    lower_right = np.clip(mask - shifted(mask, -6 * SCALE, -6 * SCALE), 0.0, 1.0)
    rgb += upper_left[..., None] * 70.0
    rgb *= 1.0 - lower_right[..., None] * 0.38

    outline = np.asarray(
        Image.fromarray(np.round(mask * 255.0).astype(np.uint8), "L").filter(ImageFilter.MaxFilter(13)),
        dtype=np.float32,
    ) / 255.0
    outline = np.clip(outline - mask, 0.0, 1.0)

    outline_rgba = np.zeros((height, width, 4), dtype=np.uint8)
    outline_rgba[..., :3] = np.array((24, 29, 35), dtype=np.uint8)
    outline_rgba[..., 3] = np.round(outline * 235.0).astype(np.uint8)
    fill_rgba = np.zeros((height, width, 4), dtype=np.uint8)
    fill_rgba[..., :3] = np.clip(rgb, 0.0, 255.0).astype(np.uint8)
    fill_rgba[..., 3] = np.round(mask * 255.0).astype(np.uint8)
    return Image.alpha_composite(Image.fromarray(outline_rgba, "RGBA"), Image.fromarray(fill_rgba, "RGBA"))


def wordmark_layer(target_width: int, vertical_offset: int = 0) -> Image.Image:
    source = extract_clean_wordmark()
    width = target_width * SCALE
    height = round(source.height * width / source.width)
    mask_image = source.resize((width, height), Image.Resampling.LANCZOS)
    mask = np.asarray(mask_image, dtype=np.float32) / 255.0
    alpha = np.zeros((WORK_SIZE[1], WORK_SIZE[0]), dtype=np.float32)
    left = (WORK_SIZE[0] - width) // 2
    top = (WORK_SIZE[1] - height) // 2 + vertical_offset * SCALE
    alpha[top : top + height, left : left + width] = mask

    extrusion = np.clip(shifted(alpha, 6 * SCALE, 7 * SCALE) - alpha * 0.91, 0.0, 1.0)
    outline = np.asarray(
        Image.fromarray(np.round(alpha * 255.0).astype(np.uint8), "L").filter(ImageFilter.MaxFilter(9)),
        dtype=np.float32,
    ) / 255.0
    outline = np.clip(outline - alpha, 0.0, 1.0)

    ys, _ = np.indices(alpha.shape)
    vertical = 1.0 - ys / max(1, alpha.shape[0] - 1)
    fill = three_stop_color(
        np.clip(0.20 + vertical * 0.72, 0.0, 1.0),
        (76, 84, 94),
        (190, 198, 205),
        (251, 249, 242),
    )
    upper_left = np.clip(alpha - shifted(alpha, 4 * SCALE, 4 * SCALE), 0.0, 1.0)
    lower_right = np.clip(alpha - shifted(alpha, -4 * SCALE, -4 * SCALE), 0.0, 1.0)
    fill += upper_left[..., None] * 68.0
    fill *= 1.0 - lower_right[..., None] * 0.31

    canvas = Image.new("RGBA", WORK_SIZE, (0, 0, 0, 0))
    for layer_alpha, color, opacity in (
        (extrusion, (22, 27, 33), 0.95),
        (outline, (38, 45, 53), 0.96),
    ):
        rgba = np.zeros((WORK_SIZE[1], WORK_SIZE[0], 4), dtype=np.uint8)
        rgba[..., :3] = np.array(color, dtype=np.uint8)
        rgba[..., 3] = np.round(layer_alpha * opacity * 255.0).astype(np.uint8)
        canvas = Image.alpha_composite(canvas, Image.fromarray(rgba, "RGBA"))
    rgba = np.zeros((WORK_SIZE[1], WORK_SIZE[0], 4), dtype=np.uint8)
    rgba[..., :3] = np.clip(fill, 0.0, 255.0).astype(np.uint8)
    rgba[..., 3] = np.round(alpha * 255.0).astype(np.uint8)
    return Image.alpha_composite(canvas, Image.fromarray(rgba, "RGBA"))


def compose_concept(name: str) -> Image.Image:
    bright_palette = ((44, 51, 59), (155, 166, 177), (245, 244, 238))
    dark_palette = ((17, 22, 28), (71, 83, 94), (185, 196, 204))
    if name == "a-crossed-force":
        first = crescent_mask((245, 36, 755, 564), "right", 112, -17)
        second = crescent_mask((445, 36, 955, 564), "left", 112, 17)
        text_width = 730
        text_offset = 8
    elif name == "b-balanced-seal":
        first = crescent_mask((300, 45, 760, 555), "right", 102, -4)
        second = crescent_mask((440, 45, 900, 555), "left", 102, 4)
        text_width = 710
        text_offset = 7
    else:
        first = crescent_mask((285, 38, 805, 562), "right", 116, -38)
        second = crescent_mask((395, 38, 915, 562), "left", 116, 38)
        text_width = 710
        text_offset = 9

    base = Image.new("RGBA", WORK_SIZE, (0, 0, 0, 0))
    first_layer = metal_layer(first, bright_palette, 0.08)
    second_layer = metal_layer(second, dark_palette, -0.04)
    base = Image.alpha_composite(base, first_layer)
    base = Image.alpha_composite(base, second_layer)
    base = Image.alpha_composite(base, wordmark_layer(text_width, text_offset))
    return base.resize(FINAL_SIZE, Image.Resampling.LANCZOS)


def concept_card(asset: Image.Image, label: str) -> Image.Image:
    card = Image.new("RGB", (1400, 700), (7, 9, 12))
    large = asset.copy()
    large.thumbnail((1180, 520), Image.Resampling.LANCZOS)
    card.paste(large, ((1400 - large.width) // 2, 35), large)
    actual = asset.resize((160, 80), Image.Resampling.LANCZOS)
    card.paste(actual, (90, 570), actual)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 48)
    except OSError:
        font = ImageFont.load_default()
    ImageDraw.Draw(card).text((28, 24), label, font=font, fill=(226, 230, 234))
    return card


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    names = ("a-crossed-force", "b-balanced-seal", "c-embracing-moons")
    cards = []
    for index, name in enumerate(names):
        asset = compose_concept(name)
        asset.save(OUTPUT_DIR / f"yingxue-twin-moon-{name}.png", optimize=True)
        card = concept_card(asset, chr(ord("A") + index))
        card.save(OUTPUT_DIR / f"yingxue-twin-moon-{name}-preview.jpg", quality=96)
        cards.append(card)
    board = Image.new("RGB", (1400, 2100), (7, 9, 12))
    for index, card in enumerate(cards):
        board.paste(card, (0, index * 700))
    board.save(OUTPUT_DIR / "yingxue-twin-moon-concept-board.jpg", quality=96)


if __name__ == "__main__":
    main()
