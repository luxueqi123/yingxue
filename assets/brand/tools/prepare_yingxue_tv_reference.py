"""Export the supplied white-background logo without changing its artwork."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--icon', type=Path)
parser.add_argument('--preview', type=Path)
args = parser.parse_args()
rgb = np.array(Image.open(args.source).convert('RGB'), dtype=float)
# Preserve solid metal pixels. Unmix white only in the faint edge light.
minimum = rgb.min(axis=2)
alpha = np.maximum((255 - minimum) / 255, np.clip((232 - minimum) / 17, 0, 1))
alpha[alpha < 0.018] = 0
color = (rgb - 255 * (1 - alpha[:, :, None])) / np.maximum(alpha[:, :, None], 1 / 255)
rgba = Image.fromarray(np.dstack((np.clip(color, 0, 255).astype(np.uint8), (alpha * 255).astype(np.uint8))))
box = rgba.getbbox()
assert box is not None
rgba = rgba.crop(box)
args.output.parent.mkdir(parents=True, exist_ok=True)
rgba.save(args.output, lossless=True, method=6)
if args.icon:
    icon = Image.new('RGBA', (128, 128))
    small = rgba.copy()
    small.thumbnail((124, 124), Image.Resampling.LANCZOS)
    icon.alpha_composite(small, ((128 - small.width) // 2, (128 - small.height) // 2))
    icon.save(args.icon)
if args.preview:
    canvas = Image.new('RGB', (rgba.width, rgba.height * 2 + 24), '#f7f7f8')
    canvas.paste(rgba, (0, 0), rgba)
    dark = Image.new('RGB', rgba.size, '#161719')
    dark.paste(rgba, (0, 0), rgba)
    canvas.paste(dark, (0, rgba.height + 24))
    canvas.save(args.preview)
print(json.dumps({'size': rgba.size, 'crop': box, 'bytes': args.output.stat().st_size, 'transparent': rgba.getchannel('A').getextrema()}))
