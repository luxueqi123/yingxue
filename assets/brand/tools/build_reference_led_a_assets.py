from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "assets/brand/generated/2026-08-23/reference-led/yingxue-reference-led-22.png"
OUTPUT_DIR = ROOT / "web/public/brand"
PREVIEW_DIR = ROOT / "assets/brand/previews"

METAL_PALETTES = {
    "frost-silver": (
        np.array((72.0, 86.0, 103.0), dtype=np.float32),
        np.array((178.0, 195.0, 210.0), dtype=np.float32),
        np.array((252.0, 254.0, 255.0), dtype=np.float32),
    ),
    "moon-ice": (
        np.array((42.0, 72.0, 101.0), dtype=np.float32),
        np.array((142.0, 183.0, 214.0), dtype=np.float32),
        np.array((246.0, 252.0, 255.0), dtype=np.float32),
    ),
    "blue-steel": (
        np.array((24.0, 52.0, 79.0), dtype=np.float32),
        np.array((91.0, 147.0, 190.0), dtype=np.float32),
        np.array((222.0, 244.0, 255.0), dtype=np.float32),
    ),
}


def smoothstep(edge0: float, edge1: float, value: np.ndarray) -> np.ndarray:
    scaled = np.clip((value - edge0) / (edge1 - edge0), 0.0, 1.0)
    return scaled * scaled * (3.0 - 2.0 * scaled)


def extract_logo(image: Image.Image) -> Image.Image:
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

    output = Image.fromarray(np.dstack((rgb, np.round(alpha * 255.0))).clip(0, 255).astype(np.uint8), "RGBA")
    bounds = output.getchannel("A").getbbox()
    if bounds is None:
        raise RuntimeError("A logo extraction produced an empty alpha channel")
    left, top, right, bottom = bounds
    padding = 20
    return output.crop(
        (
            max(0, left - padding),
            max(0, top - padding),
            min(output.width, right + padding),
            min(output.height, bottom + padding),
        )
    )


def three_stop_gradient(
    tone: np.ndarray,
    shadow: np.ndarray,
    midtone: np.ndarray,
    highlight: np.ndarray,
) -> np.ndarray:
    low_mix = np.clip(tone * 2.0, 0.0, 1.0)[..., None]
    high_mix = np.clip((tone - 0.5) * 2.0, 0.0, 1.0)[..., None]
    low = shadow + (midtone - shadow) * low_mix
    high = midtone + (highlight - midtone) * high_mix
    return np.where((tone <= 0.5)[..., None], low, high)


def make_dark_variant(image: Image.Image, palette_name: str = "moon-ice") -> Image.Image:
    rgba = np.asarray(image).copy()
    rgb = rgba[..., :3].astype(np.float32)
    luminance = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    ink = (luminance < 205.0) & (rgba[..., 3] > 0)
    texture = np.clip(luminance / 205.0, 0.0, 1.0) ** 0.72
    vertical = np.linspace(1.0, 0.0, rgba.shape[0], dtype=np.float32)[:, None]
    horizontal = np.linspace(0.0, 1.0, rgba.shape[1], dtype=np.float32)[None, :]
    tone = np.clip(0.43 + texture * 0.29 + vertical * 0.10 - horizontal * 0.035, 0.0, 1.0)
    shadow, midtone, highlight = METAL_PALETTES[palette_name]
    metal = three_stop_gradient(tone, shadow, midtone, highlight)
    rgb[ink] = metal[ink]
    rgba[..., :3] = np.clip(rgb, 0.0, 255.0).astype(np.uint8)
    graded = Image.fromarray(rgba, "RGBA")
    alpha = graded.getchannel("A")
    color = graded.convert("RGB")
    color = ImageEnhance.Brightness(color).enhance(1.02)
    color = ImageEnhance.Contrast(color).enhance(1.07)
    color = color.filter(ImageFilter.UnsharpMask(radius=1.05, percent=135, threshold=2))
    enhanced = color.convert("RGBA")
    enhanced.putalpha(alpha)
    beveled = add_bevel_light(enhanced)
    return recenter_visual_mass(add_metal_extrusion(beveled, shadow))


def shifted(values: np.ndarray, dx: int, dy: int) -> np.ndarray:
    result = np.zeros_like(values)
    source_x0 = max(0, -dx)
    source_x1 = values.shape[1] - max(0, dx)
    source_y0 = max(0, -dy)
    source_y1 = values.shape[0] - max(0, dy)
    target_x0 = max(0, dx)
    target_x1 = values.shape[1] - max(0, -dx)
    target_y0 = max(0, dy)
    target_y1 = values.shape[0] - max(0, -dy)
    result[target_y0:target_y1, target_x0:target_x1] = values[source_y0:source_y1, source_x0:source_x1]
    return result


def add_bevel_light(image: Image.Image) -> Image.Image:
    rgba = np.asarray(image).astype(np.float32)
    rgb = rgba[..., :3]
    alpha = rgba[..., 3] / 255.0
    upper_left = np.clip(alpha - shifted(alpha, 2, 2), 0.0, 1.0)
    lower_right = np.clip(alpha - shifted(alpha, -3, -3), 0.0, 1.0)
    rgb += upper_left[..., None] * np.array((62.0, 70.0, 78.0), dtype=np.float32)
    rgb *= 1.0 - lower_right[..., None] * 0.34
    rgba[..., :3] = np.clip(rgb, 0.0, 255.0)
    return Image.fromarray(rgba.astype(np.uint8), "RGBA")


def add_metal_extrusion(image: Image.Image, shadow_color: np.ndarray) -> Image.Image:
    rgba = np.asarray(image, dtype=np.float32)
    alpha = rgba[..., 3] / 255.0
    extrusion = np.maximum.reduce(tuple(shifted(alpha, offset, offset) for offset in (4, 8, 12)))
    extrusion = np.clip(extrusion - alpha * 0.82, 0.0, 1.0)
    layer = np.zeros_like(rgba)
    layer[..., :3] = shadow_color * 0.58
    layer[..., 3] = extrusion * 178.0
    return Image.alpha_composite(Image.fromarray(layer.astype(np.uint8), "RGBA"), image)


def recenter_visual_mass(image: Image.Image) -> Image.Image:
    rgba = np.asarray(image, dtype=np.float32)
    rgb = rgba[..., :3]
    alpha = rgba[..., 3] / 255.0
    luminance = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    weights = alpha * (0.35 + luminance / 255.0)
    total = float(weights.sum())
    if total <= 0.0:
        return image
    ys, xs = np.indices(alpha.shape)
    center_x = float((xs * weights).sum() / total)
    center_y = float((ys * weights).sum() / total)
    dx = round(image.width / 2.0 - center_x)
    dy = round(image.height / 2.0 - center_y)
    balanced = Image.new("RGBA", image.size, (0, 0, 0, 0))
    balanced.alpha_composite(image, (dx, dy))
    return balanced


def resize_for_web(image: Image.Image, width: int = 960) -> Image.Image:
    resized = image.copy()
    height = round(resized.height * width / resized.width)
    return resized.resize((width, height), Image.Resampling.LANCZOS)


def compose_yingxue_only(image: Image.Image) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.float32)
    rgb = rgba[..., :3]
    alpha = rgba[..., 3] / 255.0
    luminance = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    warmness = rgb[..., 0] - rgb[..., 2]
    coolness = (rgb[..., 2] - rgb[..., 0]) * 0.7 + (rgb[..., 2] - rgb[..., 1]) * 0.3
    ys, xs = np.indices(alpha.shape)

    radius = ((xs - 512.0) / 190.0) ** 2 + ((ys - 235.0) / 176.0) ** 2
    annulus = (radius > 0.48) & (radius < 1.20)
    jade = smoothstep(190.0, 238.0, luminance) * smoothstep(18.0, 3.0, warmness)
    ice = smoothstep(4.0, 24.0, coolness)
    support_strength = np.maximum(annulus * jade, ((ys > 155) & (ys < 295)) * ice) * 0.72
    support_alpha = alpha * support_strength
    support = Image.fromarray(np.dstack((rgb, np.round(support_alpha * 255.0))).clip(0, 255).astype(np.uint8), "RGBA")

    text_allowed = (xs >= 489) & (ys >= 105) & (ys <= 360) & ((ys < 326) | (xs >= 715))
    text_seed = ((luminance < 175.0) & (alpha > 0.08) & text_allowed).astype(np.uint8) * 255
    text_mask = Image.fromarray(text_seed, "L").filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(0.8))
    text_alpha = np.minimum(np.asarray(text_mask, dtype=np.float32) / 255.0, alpha) * text_allowed
    text = Image.fromarray(np.dstack((rgb, np.round(text_alpha * 255.0))).clip(0, 255).astype(np.uint8), "RGBA")
    bounds = text.getchannel("A").getbbox()
    if bounds is None:
        raise RuntimeError("Unable to isolate the 映雪 wordmark")
    left, top, right, bottom = bounds
    text = text.crop((max(0, left - 8), max(0, top - 8), min(text.width, right + 8), min(text.height, bottom + 8)))
    text_width = 650
    text = text.resize((text_width, round(text.height * text_width / text.width)), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (1120, 560), (0, 0, 0, 0))
    canvas.alpha_composite(support, ((canvas.width - support.width) // 2, 30))
    canvas.alpha_composite(text, ((canvas.width - text.width) // 2 + 18, (canvas.height - text.height) // 2 + 1))
    bounds = canvas.getchannel("A").getbbox()
    if bounds is None:
        raise RuntimeError("The 映雪 composition is empty")
    left, top, right, bottom = bounds
    padding = 32
    canvas = canvas.crop(
        (
            max(0, left - padding),
            max(0, top - padding),
            min(canvas.width, right + padding),
            min(canvas.height, bottom + padding),
        )
    )
    return resize_for_web(canvas)


def save_asset(image: Image.Image, stem: str) -> None:
    image.save(OUTPUT_DIR / f"{stem}.png", optimize=True)
    image.save(OUTPUT_DIR / f"{stem}.webp", format="WEBP", quality=90, method=4)


def build_preview(light: Image.Image, dark: Image.Image) -> None:
    canvas = Image.new("RGB", (1400, 840), (244, 241, 236))
    lower = Image.new("RGB", (1400, 420), (8, 9, 12))
    canvas.paste(lower, (0, 420))
    for index, asset in enumerate((light, dark)):
        logo = asset.copy()
        logo.thumbnail((1240, 330), Image.Resampling.LANCZOS)
        x = (1400 - logo.width) // 2
        y = index * 420 + (420 - logo.height) // 2
        canvas.paste(logo, (x, y), logo)
    canvas.save(PREVIEW_DIR / "yingxue-reference-led-a-v4-yingxue-only.jpg", quality=94)


def build_color_study(variants: dict[str, Image.Image]) -> None:
    canvas = Image.new("RGB", (1400, 960), (8, 9, 12))
    for index, (name, asset) in enumerate(variants.items()):
        logo = asset.copy()
        logo.thumbnail((1180, 230), Image.Resampling.LANCZOS)
        x = (1400 - logo.width) // 2
        y = index * 320 + 45
        canvas.paste(logo, (x, y), logo)
        label = Image.new("RGB", (260, 34), (18, 22, 29))
        canvas.paste(label, (32, index * 320 + 16))
        label_path = PREVIEW_DIR / f"yingxue-r8-{name}.png"
        asset.save(label_path, optimize=True)
    canvas.save(PREVIEW_DIR / "yingxue-r8-color-study.jpg", quality=95)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    light = compose_yingxue_only(resize_for_web(extract_logo(Image.open(SOURCE))))
    variants = {name: make_dark_variant(light, name) for name in METAL_PALETTES}
    dark = variants["moon-ice"]
    save_asset(light, "yingxue-reference-led-a-v4-light")
    save_asset(dark, "yingxue-reference-led-a-v4-dark")
    build_preview(light, dark)
    build_color_study(variants)


if __name__ == "__main__":
    main()
