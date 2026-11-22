import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from build_reference_led_a_assets import ROOT
from build_yingxue_twin_moon_concepts import FINAL_SIZE, SCALE, WORK_SIZE, wordmark_layer


OUTPUT_DIR = ROOT / "assets/brand/concepts/2026-08-24/dotted-moon"


def moon_coordinates(
    x: float,
    y: float,
    bounds: tuple[int, int, int, int],
    angle: float,
    shift: tuple[float, float],
    inner_scale: tuple[float, float],
) -> tuple[float, float]:
    left, top, right, bottom = bounds
    center_x = (left + right) * 0.5
    center_y = (top + bottom) * 0.5
    radius_x = (right - left) * 0.5
    radius_y = (bottom - top) * 0.5
    radians = math.radians(angle)
    cosine = math.cos(radians)
    sine = math.sin(radians)

    dx = x - center_x
    dy = y - center_y
    outer_x = (dx * cosine + dy * sine) / radius_x
    outer_y = (-dx * sine + dy * cosine) / radius_y

    inner_dx = x - (center_x + shift[0])
    inner_dy = y - (center_y + shift[1])
    inner_x = (inner_dx * cosine + inner_dy * sine) / (radius_x * inner_scale[0])
    inner_y = (-inner_dx * sine + inner_dy * cosine) / (radius_y * inner_scale[1])
    return outer_x * outer_x + outer_y * outer_y, inner_x * inner_x + inner_y * inner_y


def dotted_moon_layer(
    bounds: tuple[int, int, int, int],
    angle: float,
    shift: tuple[float, float],
    seed: int,
    sample_count: int,
    density: float,
    radius_range: tuple[float, float],
    colors: tuple[tuple[int, int, int], tuple[int, int, int]],
    alpha_range: tuple[int, int],
    inner_scale: tuple[float, float],
    reflection_bias: float = 0.0,
) -> Image.Image:
    rng = np.random.default_rng(seed)
    layer = Image.new("RGBA", WORK_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    left, top, right, bottom = bounds
    color_a = np.array(colors[0], dtype=np.float32)
    color_b = np.array(colors[1], dtype=np.float32)

    for _ in range(sample_count):
        x = float(rng.uniform(left, right))
        y = float(rng.uniform(top, bottom))
        outer_value, inner_value = moon_coordinates(x, y, bounds, angle, shift, inner_scale)
        if outer_value >= 1.0 or inner_value <= 1.0:
            continue
        edge_strength = np.clip(min(1.0 - outer_value, inner_value - 1.0) * 8.0, 0.0, 1.0)
        vertical_position = (y - top) / max(1.0, bottom - top)
        probability = density * (0.30 + edge_strength * 0.70)
        probability *= np.clip(1.0 + reflection_bias * (vertical_position - 0.5), 0.45, 1.55)
        if rng.random() > probability:
            continue

        mix = float(np.clip(0.22 + edge_strength * 0.62 + rng.normal(0.0, 0.08), 0.0, 1.0))
        color = color_a + (color_b - color_a) * mix
        radius = float(rng.uniform(*radius_range)) * (0.55 + edge_strength * 0.62)
        alpha = int(np.clip(rng.uniform(*alpha_range) * (0.48 + edge_strength * 0.66), 18, 245))
        center_x = round(x * SCALE)
        center_y = round(y * SCALE)
        radius_x = max(1, round(radius * SCALE))
        radius_y = radius_x
        if rng.random() < 0.025:
            radius_x = round(radius_x * rng.uniform(1.6, 2.4))
            radius_y = round(radius_y * rng.uniform(1.3, 1.9))
        elif rng.random() < 0.055:
            radius_x = round(radius_x * rng.uniform(1.35, 2.05))
            radius_y = max(1, round(radius_y * rng.uniform(0.45, 0.72)))
        fill = (*np.clip(color, 0, 255).astype(np.uint8), alpha)
        draw.ellipse(
            (center_x - radius_x, center_y - radius_y, center_x + radius_x, center_y + radius_y),
            fill=fill,
        )
    return layer


def compose_concept(name: str) -> Image.Image:
    canvas = Image.new("RGBA", WORK_SIZE, (0, 0, 0, 0))
    if name == "a-eclipse-reflection":
        upper = dotted_moon_layer(
            (300, 5, 900, 330), 0, (0, 60), 1301, 12500, 0.39, (0.7, 2.9),
            ((91, 104, 117), (244, 244, 238)), (54, 208), (0.92, 0.88), -0.22,
        )
        lower = dotted_moon_layer(
            (250, 275, 950, 595), 0, (0, -78), 1302, 14500, 0.27, (0.55, 2.35),
            ((46, 57, 69), (181, 195, 204)), (28, 148), (0.87, 0.82), 0.54,
        )
        text_width = 725
    elif name == "b-asymmetric-moonlight":
        upper = dotted_moon_layer(
            (255, 0, 800, 315), -15, (45, 57), 2301, 11800, 0.41, (0.7, 3.1),
            ((105, 113, 122), (247, 245, 237)), (58, 216), (0.91, 0.87), -0.18,
        )
        lower = dotted_moon_layer(
            (345, 285, 1010, 600), 13, (-38, -70), 2302, 15200, 0.24, (0.5, 2.25),
            ((39, 50, 62), (161, 181, 194)), (24, 138), (0.86, 0.81), 0.68,
        )
        text_width = 715
    else:
        upper = dotted_moon_layer(
            (330, 2, 930, 328), 11, (-40, 60), 3301, 13200, 0.35, (0.65, 2.8),
            ((87, 99, 112), (239, 241, 238)), (46, 196), (0.92, 0.88), -0.08,
        )
        lower = dotted_moon_layer(
            (210, 292, 865, 600), -18, (52, -66), 3302, 16500, 0.22, (0.45, 2.1),
            ((35, 45, 57), (175, 188, 198)), (22, 132), (0.86, 0.81), 0.82,
        )
        text_width = 720

    canvas = Image.alpha_composite(canvas, upper)
    canvas = Image.alpha_composite(canvas, lower)
    canvas = Image.alpha_composite(canvas, wordmark_layer(text_width, 7))
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
    names = ("a-eclipse-reflection", "b-asymmetric-moonlight", "c-counter-moon-dust")
    cards = []
    for index, name in enumerate(names):
        asset = compose_concept(name)
        asset.save(OUTPUT_DIR / f"yingxue-dotted-moon-{name}.png", optimize=True)
        card = concept_card(asset, chr(ord("A") + index))
        card.save(OUTPUT_DIR / f"yingxue-dotted-moon-{name}-preview.jpg", quality=96)
        cards.append(card)
    board = Image.new("RGB", (1400, 2100), (7, 9, 12))
    for index, card in enumerate(cards):
        board.paste(card, (0, index * 700))
    board.save(OUTPUT_DIR / "yingxue-dotted-moon-concept-board.jpg", quality=96)


if __name__ == "__main__":
    main()
