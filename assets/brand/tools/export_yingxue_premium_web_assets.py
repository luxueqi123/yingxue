from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from build_yingxue_refined_lunar_composites import ROOT, WORDMARK_MASK, make_wordmark_layer
from compose_yingxue_ai_ink_background import SIZE, extract_ink_layer


WEB_BRAND_DIR = ROOT / "web/public/brand"


def wordmark_face(width: int, top: int) -> Image.Image:
    source_mask = Image.open(WORDMARK_MASK).convert("L")
    height = round(source_mask.height * width / source_mask.width)
    mask = source_mask.resize((width, height), Image.Resampling.LANCZOS)

    vertical = np.linspace(0.0, 1.0, height, dtype=np.float32)[:, None, None]
    top_color = np.array((255.0, 255.0, 255.0), dtype=np.float32)[None, None, :]
    bottom_color = np.array((236.0, 242.0, 247.0), dtype=np.float32)[None, None, :]
    rgb = top_color + (bottom_color - top_color) * np.power(vertical, 1.55)
    rgb = np.repeat(rgb, width, axis=1)

    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    rgba[..., :3] = np.clip(rgb, 0.0, 255.0).astype(np.uint8)
    rgba[..., 3] = np.asarray(mask, dtype=np.uint8)
    face = Image.fromarray(rgba, "RGBA")

    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    layer.alpha_composite(face, ((SIZE - width) // 2, top))
    return layer


def crop_visible(image: Image.Image, margin: int) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise RuntimeError("Brand asset is empty")
    return image.crop(
        (
            max(0, bbox[0] - margin),
            max(0, bbox[1] - margin),
            min(image.width, bbox[2] + margin),
            min(image.height, bbox[3] + margin),
        )
    )


def recolor(image: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    values = np.asarray(image.convert("RGBA"), dtype=np.uint8)
    result = np.zeros_like(values)
    result[..., :3] = np.array(color, dtype=np.uint8)
    result[..., 3] = values[..., 3]
    return Image.fromarray(result, "RGBA")


def build_lockup() -> Image.Image:
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ink = extract_ink_layer()
    layer.alpha_composite(ink, ((SIZE - ink.width) // 2 + 12, (SIZE - ink.height) // 2 - 36))

    wordmark_width = 650
    wordmark_top = 372
    layer = Image.alpha_composite(layer, make_wordmark_layer(wordmark_width, wordmark_top))
    layer = Image.alpha_composite(layer, wordmark_face(wordmark_width, wordmark_top))
    return crop_visible(layer, 18)


def build_mark() -> Image.Image:
    ink = extract_ink_layer()
    ink.thumbnail((450, 450), Image.Resampling.LANCZOS)
    mark = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    mark.alpha_composite(ink, ((512 - ink.width) // 2, (512 - ink.height) // 2))
    return mark


def save_pair(base_name: str, dark: Image.Image, light: Image.Image) -> None:
    dark.save(WEB_BRAND_DIR / f"{base_name}-dark.png", optimize=True)
    light.save(WEB_BRAND_DIR / f"{base_name}-light.png", optimize=True)
    dark.save(WEB_BRAND_DIR / f"{base_name}-dark.webp", format="WEBP", lossless=True, quality=100)
    light.save(WEB_BRAND_DIR / f"{base_name}-light.webp", format="WEBP", lossless=True, quality=100)


def save_favicons(mark: Image.Image) -> None:
    base = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    ImageDraw.Draw(base).rounded_rectangle((12, 12, 500, 500), radius=112, fill=(2, 7, 14, 255))
    mark_copy = mark.copy()
    mark_copy.thumbnail((430, 430), Image.Resampling.LANCZOS)
    base.alpha_composite(mark_copy, ((512 - mark_copy.width) // 2, (512 - mark_copy.height) // 2))
    for size in (64, 192, 512):
        icon = base if size == 512 else base.resize((size, size), Image.Resampling.LANCZOS)
        icon.save(ROOT / f"web/public/favicon-{size}.png", optimize=True)


def main() -> None:
    WEB_BRAND_DIR.mkdir(parents=True, exist_ok=True)
    lockup_dark = build_lockup()
    lockup_light = recolor(lockup_dark, (15, 23, 42))
    save_pair("yingxue-premium-v5", lockup_dark, lockup_light)

    mark_dark = build_mark()
    mark_light = recolor(mark_dark, (15, 23, 42))
    save_pair("yingxue-premium-mark-v5", mark_dark, mark_light)
    save_favicons(mark_dark)


if __name__ == "__main__":
    main()
