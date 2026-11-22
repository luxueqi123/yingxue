from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageFilter

from build_reference_led_a_assets import smoothstep


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "assets/brand/generated/2026-08-23/reference-led/yingxue-reference-led-22.png"
CLEAN = ROOT / "assets/brand/concepts/2026-08-24/reference-led-centered/yingxue-reference-led-background-yingxue-only.png"
R6_LIGHT = ROOT / "web/public/brand/yingxue-reference-led-a-light.png"
R6_DARK = ROOT / "web/public/brand/yingxue-reference-led-a-dark.png"
OUTPUT_DIR = ROOT / "assets/brand/concepts/2026-08-24/reference-led-centered"
POSTER = ROOT / ".local/cache/deploy/auth-poster.jpg"


def extraction_alpha(image: Image.Image) -> np.ndarray:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.float32)
    rgb = rgba[..., :3]
    source_alpha = rgba[..., 3] / 255.0
    luminance = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    warmness = rgb[..., 0] - rgb[..., 2]
    coolness = (rgb[..., 2] - rgb[..., 0]) * 0.7 + (rgb[..., 2] - rgb[..., 1]) * 0.3
    ink = smoothstep(205.0, 105.0, luminance)
    jade = smoothstep(18.0, 3.0, warmness) * smoothstep(145.0, 225.0, luminance)
    ice_blue = smoothstep(2.0, 28.0, coolness) * smoothstep(70.0, 160.0, luminance)
    neutral_metal = smoothstep(11.0, 2.0, np.abs(warmness)) * smoothstep(90.0, 175.0, luminance)
    foreground = np.maximum.reduce((ink, jade, ice_blue, neutral_metal))
    alpha = np.clip(source_alpha * foreground, 0.0, 1.0)
    alpha_image = Image.fromarray(np.round(alpha * 255.0).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.45))
    alpha = np.asarray(alpha_image, dtype=np.float32) / 255.0
    alpha[alpha < 0.025] = 0.0
    return alpha


def extraction_crop(source: Image.Image) -> tuple[int, int, int, int]:
    alpha = extraction_alpha(source)
    bounds = Image.fromarray(np.round(alpha * 255.0).astype(np.uint8), "L").getbbox()
    if bounds is None:
        raise RuntimeError("source extraction is empty")
    left, top, right, bottom = bounds
    padding = 20
    return (
        max(0, left - padding),
        max(0, top - padding),
        min(source.width, right + padding),
        min(source.height, bottom + padding),
    )


def extract_fixed(image: Image.Image, crop: tuple[int, int, int, int], source_alpha: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    rgba.putalpha(source_alpha)
    pixels = np.asarray(rgba, dtype=np.float32)
    alpha = extraction_alpha(rgba)
    output = Image.fromarray(
        np.dstack((pixels[..., :3], np.round(alpha * 255.0))).clip(0, 255).astype(np.uint8),
        "RGBA",
    ).crop(crop)
    return output.resize((960, 468), Image.Resampling.LANCZOS)


def resized_mask(mask: np.ndarray, crop: tuple[int, int, int, int], expand: int = 1, blur: float = 0.0) -> Image.Image:
    layer = Image.fromarray(np.where(mask, 255, 0).astype(np.uint8), "L")
    if expand > 1:
        layer = layer.filter(ImageFilter.MaxFilter(expand))
    if blur > 0:
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
    return layer.crop(crop).resize((960, 468), Image.Resampling.LANCZOS)


def build_masks(source: Image.Image, clean: Image.Image, crop: tuple[int, int, int, int]) -> tuple[Image.Image, Image.Image]:
    source_rgb = np.asarray(source.convert("RGB"), dtype=np.float32)
    clean_rgb = np.asarray(clean.convert("RGB"), dtype=np.float32)
    luminance = 0.2126 * source_rgb[..., 0] + 0.7152 * source_rgb[..., 1] + 0.0722 * source_rgb[..., 2]
    delta = np.sqrt(np.sum((source_rgb - clean_rgb) ** 2, axis=2))
    ys, xs = np.indices(luminance.shape)

    chinese_region = (xs >= 180) & (xs <= 1570) & (ys >= 190) & (ys <= 625)
    english_region = (xs >= 520) & (xs <= 1040) & (ys >= 570) & (ys <= 700)
    remove = chinese_region | english_region

    wordmark_region = (xs >= 855) & (xs <= 1555) & (ys >= 220) & (ys <= 600)
    wordmark = wordmark_region & (luminance < 78.0) & (delta > 105.0)
    return (
        resized_mask(remove, crop, expand=1, blur=8.0),
        resized_mask(wordmark, crop, expand=9, blur=0.45),
    )


def center_wordmark(base: Image.Image, original: Image.Image, mask: Image.Image) -> Image.Image:
    word = original.copy()
    word.putalpha(Image.fromarray(
        np.minimum(
            np.asarray(original.getchannel("A"), dtype=np.float32),
            np.asarray(mask, dtype=np.float32),
        ).astype(np.uint8),
        "L",
    ))
    bounds = word.getchannel("A").getbbox()
    if bounds is None:
        raise RuntimeError("映雪字样提取失败")
    word = word.crop(bounds)
    result = base.copy()
    target_x = round((result.width - word.width) / 2)
    result.alpha_composite(word, (target_x, bounds[1]))
    return result


def blend_clean(original: Image.Image, clean: Image.Image, mask: Image.Image) -> Image.Image:
    return Image.composite(clean, original, mask)


def remove_subtitle_and_rules(image: Image.Image) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8).copy()
    rgb = rgba[..., :3].astype(np.float32)
    luminance = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    ys, xs = np.indices(luminance.shape)
    # The subtitle occupies a narrow band in the original 1672x941 render.
    # Mask only its dark glyphs/rules so the crescent and mist are never inpainted.
    subtitle_band = (xs >= 625) & (xs <= 1080) & (ys >= 610) & (ys <= 640)
    seed = np.where(subtitle_band & (luminance < 175.0), 255, 0).astype(np.uint8)
    mask = cv2.dilate(seed, np.ones((7, 7), dtype=np.uint8), iterations=1)
    rgba[..., :3] = cv2.inpaint(rgba[..., :3], mask, 5, cv2.INPAINT_TELEA)
    return Image.fromarray(rgba, "RGBA")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGBA")
    clean_source = remove_subtitle_and_rules(Image.open(CLEAN).convert("RGBA"))
    crop = extraction_crop(source)
    clean_light = extract_fixed(clean_source, crop, source.getchannel("A"))
    _, wordmark_mask = build_masks(source, clean_source, crop)

    original_light = Image.open(R6_LIGHT).convert("RGBA")
    original_dark = Image.open(R6_DARK).convert("RGBA")
    light = center_wordmark(clean_light, original_light, wordmark_mask)
    dark = center_wordmark(clean_light, original_dark, wordmark_mask)

    light.save(OUTPUT_DIR / "yingxue-reference-led-r6-centered-v9-precise-light.png", optimize=True)
    dark.save(OUTPUT_DIR / "yingxue-reference-led-r6-centered-v9-precise-dark.png", optimize=True)

    preview = Image.new("RGB", (1400, 520), (7, 9, 13))
    display = dark.copy()
    display.thumbnail((1240, 440), Image.Resampling.LANCZOS)
    preview.paste(display, ((preview.width - display.width) // 2, (preview.height - display.height) // 2), display)
    preview.save(OUTPUT_DIR / "yingxue-reference-led-r6-centered-v9-precise-dark-preview.jpg", quality=97)

    if POSTER.exists():
        page = Image.open(POSTER).convert("RGB").resize((1920, 1080), Image.Resampling.LANCZOS)
        shade = Image.new("RGBA", page.size, (0, 0, 0, 0))
        shade.putalpha(Image.fromarray(
            np.tile(np.linspace(112, 24, page.height, dtype=np.uint8)[:, None], (1, page.width)),
            "L",
        ))
        page = Image.alpha_composite(page.convert("RGBA"), shade)
        lockup = dark.copy()
        target_height = 112
        lockup = lockup.resize((round(lockup.width * target_height / lockup.height), target_height), Image.Resampling.LANCZOS)
        page.alpha_composite(lockup, (36, 30))
        crop = page.crop((0, 0, 520, 230)).convert("RGB")
        crop.save(OUTPUT_DIR / "yingxue-reference-led-r6-centered-v9-precise-poster-preview.jpg", quality=97)


if __name__ == "__main__":
    main()
