from pathlib import Path

import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFilter

from build_reference_led_a_assets import ROOT, SOURCE, extract_logo, resize_for_web, shifted, smoothstep


OUTPUT_DIR = ROOT / "web/public/brand"
PREVIEW_DIR = ROOT / "assets/brand/previews"
FINAL_SIZE = (960, 400)
WORK_SCALE = 2


def extract_clean_wordmark() -> Image.Image:
    source = resize_for_web(extract_logo(Image.open(SOURCE)))
    rgba = np.asarray(source.convert("RGBA"), dtype=np.float32)
    rgb = rgba[..., :3]
    alpha = rgba[..., 3] / 255.0
    luminance = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    ys, xs = np.indices(alpha.shape)
    text_region = (xs >= 489) & (ys >= 105) & (ys <= 360) & ((ys < 326) | (xs >= 715))
    ink = smoothstep(178.0, 62.0, luminance)
    text_alpha = np.clip(alpha * ink * text_region, 0.0, 1.0)
    raw_mask = np.round(text_alpha * 255.0).astype(np.uint8)
    component_count, labels, stats, _ = cv2.connectedComponentsWithStats((raw_mask >= 40).astype(np.uint8), 8)
    keep = np.zeros(raw_mask.shape, dtype=np.uint8)
    for label in range(1, component_count):
        if stats[label, cv2.CC_STAT_AREA] >= 1000:
            keep[labels == label] = 1
    keep = cv2.dilate(keep, np.ones((5, 5), dtype=np.uint8), iterations=1)
    clean_mask = np.where(keep > 0, raw_mask, 0).astype(np.uint8)
    clean_mask[clean_mask < 8] = 0
    mask = Image.fromarray(clean_mask, "L")
    bounds = mask.getbbox()
    if bounds is None:
        raise RuntimeError("Unable to isolate a clean 映雪 wordmark")
    left, top, right, bottom = bounds
    padding = 5
    return mask.crop(
        (
            max(0, left - padding),
            max(0, top - padding),
            min(mask.width, right + padding),
            min(mask.height, bottom + padding),
        )
    )


def draw_clean_halo(size: tuple[int, int]) -> Image.Image:
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    scale = WORK_SCALE
    bounds = tuple(value * scale for value in (312, 12, 708, 388))
    draw.arc(bounds, start=202, end=516, fill=(60, 67, 76, 205), width=13 * scale)
    draw.arc(bounds, start=216, end=342, fill=(233, 236, 237, 232), width=5 * scale)
    inner = tuple(value * scale for value in (327, 27, 693, 373))
    draw.arc(inner, start=208, end=332, fill=(151, 161, 170, 205), width=3 * scale)

    center_x = 712 * scale
    center_y = 58 * scale
    horizontal = 20 * scale
    vertical = 28 * scale
    waist = 3 * scale
    star = [
        (center_x, center_y - vertical),
        (center_x + waist, center_y - waist),
        (center_x + horizontal, center_y),
        (center_x + waist, center_y + waist),
        (center_x, center_y + vertical),
        (center_x - waist, center_y + waist),
        (center_x - horizontal, center_y),
        (center_x - waist, center_y - waist),
    ]
    draw.polygon(star, fill=(246, 245, 239, 238))
    return layer


def colorize_wordmark(mask: Image.Image, canvas_size: tuple[int, int]) -> Image.Image:
    target_width = 650 * WORK_SCALE
    target_height = round(mask.height * target_width / mask.width)
    wordmark = mask.resize((target_width, target_height), Image.Resampling.LANCZOS)
    alpha = np.asarray(wordmark, dtype=np.float32) / 255.0
    canvas_alpha = np.zeros((canvas_size[1], canvas_size[0]), dtype=np.float32)
    x = (canvas_size[0] - target_width) // 2
    y = (canvas_size[1] - target_height) // 2 + 5 * WORK_SCALE
    canvas_alpha[y : y + target_height, x : x + target_width] = alpha

    outline = np.asarray(
        Image.fromarray(np.round(canvas_alpha * 255.0).astype(np.uint8), "L").filter(ImageFilter.MaxFilter(7)),
        dtype=np.float32,
    ) / 255.0
    outline = np.clip(outline - canvas_alpha, 0.0, 1.0)
    extrusion = np.clip(shifted(canvas_alpha, 4 * WORK_SCALE, 4 * WORK_SCALE) - canvas_alpha * 0.92, 0.0, 1.0)

    height, width = canvas_alpha.shape
    vertical = np.linspace(0.0, 1.0, height, dtype=np.float32)[:, None]
    top = np.array((248.0, 247.0, 242.0), dtype=np.float32)
    middle = np.array((205.0, 211.0, 216.0), dtype=np.float32)
    bottom = np.array((119.0, 128.0, 138.0), dtype=np.float32)
    first_half = np.clip(vertical / 0.56, 0.0, 1.0)[..., None]
    second_half = np.clip((vertical - 0.56) / 0.44, 0.0, 1.0)[..., None]
    base = np.where(
        (vertical <= 0.56)[..., None],
        top + (middle - top) * first_half,
        middle + (bottom - middle) * second_half,
    )
    base = np.broadcast_to(base, (height, width, 3)).copy()

    upper_left = np.clip(canvas_alpha - shifted(canvas_alpha, 3 * WORK_SCALE, 3 * WORK_SCALE), 0.0, 1.0)
    lower_right = np.clip(canvas_alpha - shifted(canvas_alpha, -3 * WORK_SCALE, -3 * WORK_SCALE), 0.0, 1.0)
    base += upper_left[..., None] * 62.0
    base *= 1.0 - lower_right[..., None] * 0.28

    layers = []
    for layer_alpha, color, opacity in (
        (extrusion, np.array((39.0, 46.0, 53.0), dtype=np.float32), 0.92),
        (outline, np.array((57.0, 65.0, 73.0), dtype=np.float32), 0.90),
    ):
        rgba = np.zeros((height, width, 4), dtype=np.uint8)
        rgba[..., :3] = color.astype(np.uint8)
        rgba[..., 3] = np.round(layer_alpha * opacity * 255.0).astype(np.uint8)
        layers.append(Image.fromarray(rgba, "RGBA"))

    fill = np.zeros((height, width, 4), dtype=np.uint8)
    fill[..., :3] = np.clip(base, 0.0, 255.0).astype(np.uint8)
    fill[..., 3] = np.round(canvas_alpha * 255.0).astype(np.uint8)
    layers.append(Image.fromarray(fill, "RGBA"))

    composed = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    for layer in layers:
        composed = Image.alpha_composite(composed, layer)
    return composed


def build_dark_asset() -> Image.Image:
    work_size = (FINAL_SIZE[0] * WORK_SCALE, FINAL_SIZE[1] * WORK_SCALE)
    halo = draw_clean_halo(work_size)
    wordmark = colorize_wordmark(extract_clean_wordmark(), work_size)
    asset = Image.alpha_composite(halo, wordmark)
    return asset.resize(FINAL_SIZE, Image.Resampling.LANCZOS)


def build_preview(asset: Image.Image) -> None:
    preview = Image.new("RGB", (1400, 720), (8, 9, 12))
    large = asset.copy()
    large.thumbnail((1040, 390), Image.Resampling.LANCZOS)
    preview.paste(large, ((1400 - large.width) // 2, 70), large)
    actual = asset.resize((round(80 * asset.width / asset.height), 80), Image.Resampling.LANCZOS)
    preview.paste(actual, (90, 560), actual)
    preview.save(PREVIEW_DIR / "yingxue-v5-clean-logo-preview.jpg", quality=96)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    isolated = extract_clean_wordmark()
    isolated.save(PREVIEW_DIR / "yingxue-v5-isolated-wordmark.png", optimize=True)
    dark = build_dark_asset()
    dark.save(OUTPUT_DIR / "yingxue-clean-v5-dark.png", optimize=True)
    dark.save(OUTPUT_DIR / "yingxue-clean-v5-dark.webp", format="WEBP", lossless=True, method=6)
    build_preview(dark)


if __name__ == "__main__":
    main()
