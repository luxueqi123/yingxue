from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

from build_yingxue_refined_lunar_composites import ROOT, WORDMARK_MASK, make_wordmark_layer


SIZE = 1024
CONCEPT_DIR = ROOT / "assets/brand/concepts/2026-08-24/reference-driven-ink-moon"
INK_SOURCE = CONCEPT_DIR / "yingxue-ink-background-ai-v2.png"
OUTPUT = CONCEPT_DIR / "yingxue-reference-ink-logo-v5-premium.png"
PREVIEW = CONCEPT_DIR / "yingxue-reference-ink-logo-v5-premium-preview.jpg"


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


def circular_dilate(alpha: np.ndarray, radius: int) -> np.ndarray:
    height, width = alpha.shape
    expanded = alpha.copy()
    for offset_y in range(-radius, radius + 1):
        for offset_x in range(-radius, radius + 1):
            if offset_x * offset_x + offset_y * offset_y > radius * radius:
                continue
            shifted = np.zeros_like(alpha)
            source_x0 = max(0, -offset_x)
            source_x1 = min(width, width - offset_x)
            source_y0 = max(0, -offset_y)
            source_y1 = min(height, height - offset_y)
            target_x0 = max(0, offset_x)
            target_x1 = target_x0 + (source_x1 - source_x0)
            target_y0 = max(0, offset_y)
            target_y1 = target_y0 + (source_y1 - source_y0)
            shifted[target_y0:target_y1, target_x0:target_x1] = alpha[source_y0:source_y1, source_x0:source_x1]
            expanded = np.maximum(expanded, shifted)
    return expanded


def extract_ink_layer() -> Image.Image:
    source = Image.open(INK_SOURCE).convert("RGB")
    gray = ImageOps.grayscale(source)
    values = np.asarray(gray, dtype=np.float32)
    alpha = np.clip((values - 4.0) / 226.0, 0.0, 1.0)
    alpha = np.power(alpha, 0.74) * 1.0
    alpha[values < 7.0] = 0.0
    expanded = circular_dilate(alpha, 4)
    expanded_alpha_image = Image.fromarray(
        np.round(np.clip(expanded, 0.0, 1.0) * 255.0).astype(np.uint8), "L"
    ).filter(ImageFilter.GaussianBlur(0.75))
    expanded_alpha = np.asarray(expanded_alpha_image, dtype=np.float32) / 255.0
    alpha = np.maximum(alpha, expanded_alpha * 0.76)

    rgba = np.zeros((source.height, source.width, 4), dtype=np.uint8)
    rgba[..., :3] = np.array((252, 253, 255), dtype=np.uint8)
    rgba[..., 3] = np.round(alpha * 255.0).astype(np.uint8)
    layer = Image.fromarray(rgba, "RGBA")

    bbox = layer.getchannel("A").getbbox()
    if bbox is None:
        raise RuntimeError("Generated ink source contains no visible ink")
    layer = layer.crop(bbox)
    layer = layer.resize((630, 630), Image.Resampling.LANCZOS)
    return layer


def compose() -> Image.Image:
    canvas = Image.new("RGBA", (SIZE, SIZE), (2, 7, 14, 255))
    ink = extract_ink_layer()
    ink_x = (SIZE - ink.width) // 2 + 12
    ink_y = (SIZE - ink.height) // 2 - 36
    canvas.alpha_composite(ink, (ink_x, ink_y))

    wordmark_width = 650
    wordmark_top = 372
    canvas = Image.alpha_composite(canvas, make_wordmark_layer(wordmark_width, wordmark_top))

    source_mask = Image.open(WORDMARK_MASK).convert("L")
    wordmark_height = round(source_mask.height * wordmark_width / source_mask.width)
    resized_mask = source_mask.resize((wordmark_width, wordmark_height), Image.Resampling.LANCZOS)
    vertical = np.linspace(0.0, 1.0, wordmark_height, dtype=np.float32)[:, None, None]
    top = np.array((255.0, 255.0, 255.0), dtype=np.float32)[None, None, :]
    bottom = np.array((236.0, 242.0, 247.0), dtype=np.float32)[None, None, :]
    face_rgb = top + (bottom - top) * np.power(vertical, 1.55)
    face_rgb = np.repeat(face_rgb, wordmark_width, axis=1)
    face_rgba = np.zeros((wordmark_height, wordmark_width, 4), dtype=np.uint8)
    face_rgba[..., :3] = np.clip(face_rgb, 0.0, 255.0).astype(np.uint8)
    face_rgba[..., 3] = np.asarray(resized_mask, dtype=np.uint8)
    fill = Image.fromarray(face_rgba, "RGBA")
    white_fill = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    white_fill.alpha_composite(fill, ((SIZE - wordmark_width) // 2, wordmark_top))
    canvas = Image.alpha_composite(canvas, white_fill)
    return canvas.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1.05, percent=105, threshold=4))


def build_preview(output: Image.Image) -> None:
    preview = Image.new("RGB", (1400, 760), (5, 8, 13))
    preview.paste(output.resize((620, 620), Image.Resampling.LANCZOS), (390, 36))
    draw = ImageDraw.Draw(preview)
    draw.text((34, 30), "REFERENCE-DRIVEN INK MOON", font=load_font(40, True), fill=(220, 231, 238))
    draw.text((35, 94), "80 px check", font=load_font(25), fill=(102, 126, 143))
    thumb = output.resize((80, 80), Image.Resampling.LANCZOS)
    preview.paste(thumb, (42, 138))
    draw.rectangle((40, 136, 124, 220), outline=(42, 63, 77), width=2)
    preview.save(PREVIEW, quality=97)


def main() -> None:
    CONCEPT_DIR.mkdir(parents=True, exist_ok=True)
    output = compose()
    output.save(OUTPUT, quality=98)
    build_preview(output)


if __name__ == "__main__":
    main()
