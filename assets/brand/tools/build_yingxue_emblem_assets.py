from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "assets/brand/generated/2026-08-23/yingxue-emblem-logo-12.png"
OUTPUT_DIR = ROOT / "web/public/brand"


def smoothstep(edge0: float, edge1: float, value: np.ndarray) -> np.ndarray:
    scaled = np.clip((value - edge0) / (edge1 - edge0), 0.0, 1.0)
    return scaled * scaled * (3.0 - 2.0 * scaled)


def extract_foreground(image: Image.Image) -> Image.Image:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    corners = np.concatenate(
        (
            rgb[:80, :80].reshape(-1, 3),
            rgb[:80, -80:].reshape(-1, 3),
            rgb[-80:, :80].reshape(-1, 3),
            rgb[-80:, -80:].reshape(-1, 3),
        )
    )
    background = np.median(corners, axis=0)
    distance = np.linalg.norm(rgb - background, axis=2)
    alpha = smoothstep(8.0, 24.0, distance)

    safe_alpha = np.maximum(alpha[..., None], 0.08)
    foreground = (rgb - (1.0 - alpha[..., None]) * background) / safe_alpha
    foreground = np.clip(foreground, 0.0, 255.0)
    rgba = np.dstack((foreground, alpha[..., None] * 255.0)).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def fit_square(image: Image.Image, size: int = 1024, padding: int = 70) -> Image.Image:
    alpha = np.asarray(image.getchannel("A"))
    ys, xs = np.where(alpha > 7)
    crop = image.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    target = size - padding * 2
    crop.thumbnail((target, target), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(crop, ((size - crop.width) // 2, (size - crop.height) // 2))
    return canvas


def make_dark_variant(image: Image.Image) -> Image.Image:
    rgba = np.asarray(image).copy()
    rgb = rgba[..., :3].astype(np.float32)
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    luminance = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    neutral_ink = (chroma < 38) & (luminance < 228) & (rgba[..., 3] > 0)
    lightness = np.clip(242.0 - luminance * 0.12, 208.0, 244.0).astype(np.uint8)
    for channel in range(3):
        rgba[..., channel][neutral_ink] = lightness[neutral_ink]
    return Image.fromarray(rgba, "RGBA")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    light = fit_square(extract_foreground(Image.open(SOURCE)))
    dark = make_dark_variant(light)
    light.save(OUTPUT_DIR / "yingxue-emblem-light.png", optimize=True)
    dark.save(OUTPUT_DIR / "yingxue-emblem-dark.png", optimize=True)


if __name__ == "__main__":
    main()
