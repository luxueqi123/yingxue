from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

from build_reference_led_a_assets import extract_logo, make_dark_variant, resize_for_web


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "assets/brand/generated/2026-08-23/reference-led/yingxue-reference-led-22.png"
CLEAN_BACKGROUND = (
    ROOT
    / "assets/brand/concepts/2026-08-24/reference-led-centered/yingxue-reference-led-background-yingxue-only.png"
)
OUTPUT_DIR = ROOT / "assets/brand/concepts/2026-08-24/reference-led-centered"


def smooth_mask(seed: np.ndarray, size: int, blur: float) -> np.ndarray:
    mask = Image.fromarray(np.where(seed, 255, 0).astype(np.uint8), "L")
    mask = mask.filter(ImageFilter.MaxFilter(size)).filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(mask, dtype=np.float32) / 255.0


def compose_exact_centered() -> Image.Image:
    source = Image.open(SOURCE).convert("RGBA")
    clean = Image.open(CLEAN_BACKGROUND).convert("RGB")
    if clean.size != source.size:
        clean = clean.resize(source.size, Image.Resampling.LANCZOS)

    rgba = np.asarray(source, dtype=np.float32)
    source_rgb = rgba[..., :3]
    source_alpha = rgba[..., 3] / 255.0
    clean_rgb = np.asarray(clean, dtype=np.float32)
    luminance = 0.2126 * source_rgb[..., 0] + 0.7152 * source_rgb[..., 1] + 0.0722 * source_rgb[..., 2]
    background_delta = np.sqrt(np.sum((source_rgb - clean_rgb) ** 2, axis=2))
    ys, xs = np.indices(source_alpha.shape)

    base_rgb = clean_rgb.copy()

    wordmark_region = (xs >= 855) & (xs <= 1550) & (ys >= 225) & (ys <= 590)
    wordmark_seed = (
        wordmark_region
        & (source_alpha > 0.04)
        & (luminance < 105.0)
        & (background_delta > 60.0)
    )
    wordmark_alpha = smooth_mask(wordmark_seed, size=13, blur=0.7) * source_alpha
    wordmark_alpha[wordmark_alpha < 0.025] = 0.0

    wordmark_rgba = np.dstack((source_rgb, np.round(wordmark_alpha * 255.0)))
    wordmark = Image.fromarray(np.clip(wordmark_rgba, 0, 255).astype(np.uint8), "RGBA")
    bounds = wordmark.getchannel("A").getbbox()
    if bounds is None:
        raise RuntimeError("Unable to isolate the original 映雪 wordmark")
    wordmark = wordmark.crop(bounds)

    base_rgba = np.dstack((base_rgb, np.round(source_alpha * 255.0)))
    composed = Image.fromarray(np.clip(base_rgba, 0, 255).astype(np.uint8), "RGBA")
    target_x = round((composed.width - wordmark.width) / 2)
    target_y = bounds[1]
    composed.alpha_composite(wordmark, (target_x, target_y))
    return composed


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    centered = compose_exact_centered()
    centered.save(OUTPUT_DIR / "yingxue-reference-led-centered-v6-exact.png", optimize=True)

    light = resize_for_web(extract_logo(centered))
    dark = make_dark_variant(light, "frost-silver")
    light.save(OUTPUT_DIR / "yingxue-reference-led-centered-v6-light.png", optimize=True)
    dark.save(OUTPUT_DIR / "yingxue-reference-led-centered-v6-dark.png", optimize=True)

    preview = Image.new("RGB", (1400, 520), (7, 9, 13))
    display = dark.copy()
    display.thumbnail((1240, 440), Image.Resampling.LANCZOS)
    preview.paste(display, ((preview.width - display.width) // 2, (preview.height - display.height) // 2), display)
    preview.save(OUTPUT_DIR / "yingxue-reference-led-centered-v6-dark-preview.jpg", quality=96)


if __name__ == "__main__":
    main()
