from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from build_reference_led_a_assets import ROOT, shifted
from build_yingxue_twin_moon_concepts import FINAL_SIZE, SCALE, WORK_SIZE, metal_layer, wordmark_layer


OUTPUT_DIR = ROOT / "assets/brand/concepts/2026-08-24/clean-reference-composition"


def cubic_bezier(
    start: tuple[float, float],
    control_a: tuple[float, float],
    control_b: tuple[float, float],
    end: tuple[float, float],
    steps: int = 96,
) -> list[tuple[int, int]]:
    points = []
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


def crescent_mask(
    bounds: tuple[int, int, int, int],
    inner_shift: tuple[int, int],
    inner_scale: tuple[float, float],
    angle: float,
) -> np.ndarray:
    outer = Image.new("L", WORK_SIZE, 0)
    draw = ImageDraw.Draw(outer)
    left, top, right, bottom = bounds
    draw.ellipse(tuple(value * SCALE for value in bounds), fill=255)
    center = (((left + right) // 2) * SCALE, ((top + bottom) // 2) * SCALE)

    radius_x = (right - left) * 0.5
    radius_y = (bottom - top) * 0.5
    center_x = (left + right) * 0.5 + inner_shift[0]
    center_y = (top + bottom) * 0.5 + inner_shift[1]
    inner_bounds = (
        round((center_x - radius_x * inner_scale[0]) * SCALE),
        round((center_y - radius_y * inner_scale[1]) * SCALE),
        round((center_x + radius_x * inner_scale[0]) * SCALE),
        round((center_y + radius_y * inner_scale[1]) * SCALE),
    )
    draw.ellipse(inner_bounds, fill=0)
    if angle:
        outer = outer.rotate(angle, resample=Image.Resampling.BICUBIC, center=center)
    return np.asarray(outer, dtype=np.float32) / 255.0


def blade_mask(config: dict[str, tuple[tuple[float, float], ...]]) -> np.ndarray:
    layer = Image.new("L", WORK_SIZE, 0)
    draw = ImageDraw.Draw(layer)
    top = cubic_bezier(*config["top"])
    bottom = list(reversed(cubic_bezier(*config["bottom"])))
    draw.polygon(top + bottom, fill=255)
    return np.asarray(layer, dtype=np.float32) / 255.0


def add_facets(layer: Image.Image, mask: np.ndarray, variant: str) -> Image.Image:
    facets = Image.new("RGBA", WORK_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(facets)
    if variant == "a-balanced":
        polygons = (
            ((470, 86), (620, 58), (678, 122), (530, 170)),
            ((690, 92), (820, 152), (778, 230), (650, 172)),
        )
    elif variant == "b-rising":
        polygons = (
            ((520, 62), (692, 52), (744, 116), (578, 154)),
            ((742, 102), (860, 166), (820, 234), (690, 166)),
        )
    else:
        polygons = (
            ((500, 78), (650, 48), (708, 110), (562, 154)),
            ((688, 90), (800, 146), (762, 208), (644, 160)),
        )
    for index, polygon in enumerate(polygons):
        scaled = tuple((x * SCALE, y * SCALE) for x, y in polygon)
        fill = (224, 230, 233, 40 if index == 0 else 25)
        draw.polygon(scaled, fill=fill)
    facets.putalpha(Image.fromarray(np.round(mask * 255.0).astype(np.uint8), "L"))
    return Image.alpha_composite(layer, facets)


def blade_highlight(mask: np.ndarray) -> Image.Image:
    upper_edge = np.clip(mask - shifted(mask, 0, 5 * SCALE), 0.0, 1.0)
    rgba = np.zeros((WORK_SIZE[1], WORK_SIZE[0], 4), dtype=np.uint8)
    rgba[..., :3] = np.array((246, 246, 241), dtype=np.uint8)
    rgba[..., 3] = np.round(upper_edge * 188.0).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def compose_concept(name: str) -> Image.Image:
    dark_palette = ((27, 34, 42), (82, 95, 108), (193, 203, 210))
    light_palette = ((46, 54, 63), (154, 166, 176), (246, 244, 237))
    if name == "a-balanced":
        moon = crescent_mask((350, 28, 875, 470), (52, 58), (0.86, 0.83), 8)
        blade = blade_mask(
            {
                "top": ((220, 391), (430, 344), (705, 431), (1018, 354)),
                "bottom": ((232, 414), (462, 468), (746, 462), (1012, 382)),
            }
        )
        text_width = 725
    elif name == "b-rising":
        moon = crescent_mask((410, 14, 940, 448), (62, 52), (0.86, 0.82), 15)
        blade = blade_mask(
            {
                "top": ((205, 410), (442, 370), (730, 440), (1045, 322)),
                "bottom": ((217, 433), (482, 474), (792, 451), (1040, 350)),
            }
        )
        text_width = 715
    else:
        moon = crescent_mask((390, 42, 850, 455), (48, 55), (0.84, 0.82), 5)
        blade = blade_mask(
            {
                "top": ((250, 393), (448, 359), (710, 422), (972, 355)),
                "bottom": ((260, 417), (470, 462), (738, 454), (968, 383)),
            }
        )
        text_width = 742

    canvas = Image.new("RGBA", WORK_SIZE, (0, 0, 0, 0))
    moon_layer = metal_layer(moon, dark_palette, -0.03)
    blade_layer = metal_layer(blade, light_palette, 0.07)
    blade_layer = Image.alpha_composite(blade_layer, blade_highlight(blade))
    canvas = Image.alpha_composite(canvas, moon_layer)
    canvas = Image.alpha_composite(canvas, blade_layer)
    canvas = Image.alpha_composite(canvas, wordmark_layer(text_width, 5))
    return canvas.resize(FINAL_SIZE, Image.Resampling.LANCZOS)


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
    names = ("a-balanced", "b-rising", "c-compact")
    cards = []
    for index, name in enumerate(names):
        asset = compose_concept(name)
        asset.save(OUTPUT_DIR / f"yingxue-clean-composition-{name}.png", optimize=True)
        card = concept_card(asset, chr(ord("A") + index))
        card.save(OUTPUT_DIR / f"yingxue-clean-composition-{name}-preview.jpg", quality=96)
        cards.append(card)
    board = Image.new("RGB", (1400, 2100), (7, 9, 12))
    for index, card in enumerate(cards):
        board.paste(card, (0, index * 700))
    board.save(OUTPUT_DIR / "yingxue-clean-composition-board.jpg", quality=96)


if __name__ == "__main__":
    main()
