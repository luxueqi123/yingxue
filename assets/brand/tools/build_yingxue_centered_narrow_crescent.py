from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from build_yingxue_refined_lunar_composites import ROOT, WORDMARK_MASK, make_wordmark_layer
CONCEPT_DIR = ROOT / "assets/brand/concepts/2026-08-24/centered-narrow-crescent"
SIZE = 1024
SCALE = 3
WORK_SIZE = SIZE * SCALE


def smoothstep(edge0: float, edge1: float, value: np.ndarray) -> np.ndarray:
    normalized = np.clip((value - edge0) / (edge1 - edge0), 0.0, 1.0)
    return normalized * normalized * (3.0 - 2.0 * normalized)


def cubic_bezier(
    start: tuple[float, float],
    control_a: tuple[float, float],
    control_b: tuple[float, float],
    end: tuple[float, float],
    steps: int = 180,
) -> list[tuple[int, int]]:
    points: list[tuple[int, int]] = []
    for t in np.linspace(0.0, 1.0, steps):
        inverse = 1.0 - t
        x = (
            inverse**3 * start[0]
            + 3.0 * inverse**2 * t * control_a[0]
            + 3.0 * inverse * t**2 * control_b[0]
            + t**3 * end[0]
        )
        y = (
            inverse**3 * start[1]
            + 3.0 * inverse**2 * t * control_a[1]
            + 3.0 * inverse * t**2 * control_b[1]
            + t**3 * end[1]
        )
        points.append((round(x * SCALE), round(y * SCALE)))
    return points


def build_crescent_mask() -> np.ndarray:
    image = Image.new("L", (WORK_SIZE, WORK_SIZE), 0)
    draw = ImageDraw.Draw(image)

    top_tip = (720.0, 260.0)
    lower_tip = (770.0, 735.0)
    outer = cubic_bezier(top_tip, (400.0, 330.0), (360.0, 610.0), lower_tip)
    inner = cubic_bezier(lower_tip, (650.0, 620.0), (650.0, 365.0), top_tip)
    draw.polygon(outer + inner, fill=255)

    return np.asarray(image, dtype=np.float32) / 255.0


def build_virtual_crescent_layer() -> Image.Image:
    rng = np.random.default_rng(20260824)
    mask = build_crescent_mask()
    random_field = rng.random((WORK_SIZE, WORK_SIZE), dtype=np.float32)
    random_image = Image.fromarray(np.round(random_field * 255.0).astype(np.uint8), "L")
    broad_noise = np.asarray(random_image.filter(ImageFilter.GaussianBlur(34)), dtype=np.float32) / 255.0
    fine_noise = np.asarray(random_image.filter(ImageFilter.GaussianBlur(5)), dtype=np.float32) / 255.0
    broad_noise = (broad_noise - broad_noise.min()) / max(1e-6, broad_noise.max() - broad_noise.min())
    fine_noise = (fine_noise - fine_noise.min()) / max(1e-6, fine_noise.max() - fine_noise.min())

    top_tip = (720.0, 260.0)
    lower_tip = (770.0, 735.0)
    outer = np.asarray(
        cubic_bezier(top_tip, (400.0, 330.0), (360.0, 610.0), lower_tip, steps=240),
        dtype=np.float32,
    )
    inner = np.asarray(
        cubic_bezier(top_tip, (650.0, 365.0), (650.0, 620.0), lower_tip, steps=240),
        dtype=np.float32,
    )

    ink_islands = smoothstep(0.43, 0.66, 0.70 * broad_noise + 0.30 * fine_noise)
    alpha = mask * (0.004 + 0.032 * ink_islands)

    mask_image = Image.fromarray(np.round(mask * 255.0).astype(np.uint8), "L")
    eroded = np.asarray(mask_image.filter(ImageFilter.MinFilter(19)), dtype=np.float32) / 255.0
    broken_outline = np.clip(mask - eroded, 0.0, 1.0)
    alpha = np.maximum(alpha, broken_outline * (0.06 + 0.16 * ink_islands))

    flecks = Image.new("L", (WORK_SIZE, WORK_SIZE), 0)
    fleck_draw = ImageDraw.Draw(flecks)
    for _ in range(1650):
        path_index = int(rng.integers(2, len(outer) - 2))
        ratio = float(rng.uniform(0.02, 0.98))
        point = outer[path_index] * (1.0 - ratio) + inner[path_index] * ratio
        before = outer[path_index - 2] * (1.0 - ratio) + inner[path_index - 2] * ratio
        after = outer[path_index + 2] * (1.0 - ratio) + inner[path_index + 2] * ratio
        tangent = after - before
        tangent /= max(1e-6, float(np.linalg.norm(tangent)))
        length = float(min(34.0, rng.lognormal(mean=2.15, sigma=0.58)) * SCALE)
        center = point + rng.normal(0.0, 1.3 * SCALE, size=2)
        start = center - tangent * length * 0.5
        end = center + tangent * length * 0.5
        opacity = round(rng.uniform(0.24, 0.88) * 255.0)
        width = max(1, round(rng.uniform(0.55, 3.8) * SCALE))
        fleck_draw.line([tuple(start.astype(int)), tuple(end.astype(int))], fill=opacity, width=width)
    fleck_values = np.asarray(flecks.filter(ImageFilter.GaussianBlur(0.18 * SCALE)), dtype=np.float32) / 255.0
    alpha = np.maximum(alpha, fleck_values * mask)

    rgba = np.zeros((WORK_SIZE, WORK_SIZE, 4), dtype=np.uint8)
    rgba[..., :3] = np.array((252, 253, 255), dtype=np.uint8)
    rgba[..., 3] = np.round(np.clip(alpha, 0.0, 0.82) * 255.0).astype(np.uint8)

    crescent = Image.fromarray(rgba, "RGBA")

    return crescent.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def compose_final() -> Image.Image:
    canvas = Image.new("RGBA", (SIZE, SIZE), (2, 7, 14, 255))
    crescent = build_virtual_crescent_layer()
    alpha_bbox = crescent.getchannel("A").getbbox()
    if alpha_bbox is None:
        raise RuntimeError("Water-ink crescent generation produced an empty layer")
    margin = 18
    crop_box = (
        max(0, alpha_bbox[0] - margin),
        max(0, alpha_bbox[1] - margin),
        min(crescent.width, alpha_bbox[2] + margin),
        min(crescent.height, alpha_bbox[3] + margin),
    )
    crescent = crescent.crop(crop_box)
    crescent.thumbnail((390, 585), Image.Resampling.LANCZOS)
    crescent = crescent.resize((round(crescent.width * 1.34), crescent.height), Image.Resampling.LANCZOS)

    crescent_x = (SIZE - crescent.width) // 2 + 28
    crescent_y = (SIZE - crescent.height) // 2 - 2
    canvas.alpha_composite(crescent, (crescent_x, crescent_y))

    wordmark_width = 650
    wordmark_top = 372
    wordmark = make_wordmark_layer(wordmark_width, wordmark_top)
    canvas = Image.alpha_composite(canvas, wordmark)

    source_mask = Image.open(WORDMARK_MASK).convert("L")
    wordmark_height = round(source_mask.height * wordmark_width / source_mask.width)
    resized_mask = source_mask.resize((wordmark_width, wordmark_height), Image.Resampling.LANCZOS)
    white_fill = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    fill = Image.new("RGBA", (wordmark_width, wordmark_height), (252, 253, 255, 255))
    fill.putalpha(resized_mask)
    white_fill.alpha_composite(fill, ((SIZE - wordmark_width) // 2, wordmark_top))
    canvas = Image.alpha_composite(canvas, white_fill)
    return canvas.convert("RGB")


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


def build_preview(output: Image.Image) -> None:
    preview = Image.new("RGB", (1400, 760), (5, 8, 13))
    display = output.resize((620, 620), Image.Resampling.LANCZOS)
    preview.paste(display, (390, 36))
    draw = ImageDraw.Draw(preview)
    draw.text((34, 30), "CENTERED NARROW CRESCENT", font=load_font(42, True), fill=(220, 231, 238))
    draw.text((35, 94), "80 px check", font=load_font(25), fill=(102, 126, 143))
    thumb = output.resize((80, 80), Image.Resampling.LANCZOS)
    preview.paste(thumb, (42, 138))
    draw.rectangle((40, 136, 124, 220), outline=(42, 63, 77), width=2)
    preview.save(CONCEPT_DIR / "yingxue-centered-crescent-v13-pure-white-ink-preview.jpg", quality=97)


def build_comparison(output: Image.Image) -> None:
    previous_path = CONCEPT_DIR / "yingxue-centered-crescent-v7-inner-wide-ice-silver.png"
    if not previous_path.exists():
        return
    previous = Image.open(previous_path).convert("RGB")
    comparison = Image.new("RGB", (1420, 760), (5, 8, 13))
    comparison.paste(previous.resize((620, 620), Image.Resampling.LANCZOS), (60, 82))
    comparison.paste(output.resize((620, 620), Image.Resampling.LANCZOS), (740, 82))
    draw = ImageDraw.Draw(comparison)
    draw.text((60, 24), "V7 / MATERIAL MOON", font=load_font(34, True), fill=(128, 146, 160))
    draw.text((740, 24), "V13 / PURE WHITE INK", font=load_font(34, True), fill=(232, 242, 248))
    comparison.save(CONCEPT_DIR / "yingxue-centered-crescent-v7-v13-ink-comparison.jpg", quality=97)


def main() -> None:
    CONCEPT_DIR.mkdir(parents=True, exist_ok=True)
    output = compose_final()
    output.save(CONCEPT_DIR / "yingxue-centered-crescent-v13-pure-white-ink.png", quality=98)
    build_preview(output)
    build_comparison(output)


if __name__ == "__main__":
    main()
