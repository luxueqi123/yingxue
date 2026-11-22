"""Prepare responsive brand assets from the user's approved raster artwork."""
import base64
import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path('D:/天琊书客/临时工作区/Codex/2026-09-27/yingxue-full-upstream-sync')
SOURCE = Path('E:/UserData/Caches/temp/codex-clipboard-e411e1ec-06af-4472-8307-26d5a140e2a7.png')
APPROVED = ROOT/'assets/brand/approved/20261104'
PUBLIC = ROOT/'web/public/brand'
OUT = ROOT/'.local/cache/brand-visibility-20261104'
PREFIX = 'yingxue-20261104-v2'


def transparent_crop(source, bounds):
    pixels = np.array(source.crop(bounds)).astype(np.float32)
    # The supplied artwork has a near-black studio background. Remove only
    # that backdrop and the floor reflection outside the explicit crops.
    alpha = np.clip((pixels.max(axis=2) - 55) / 55, 0, 1)
    return Image.fromarray(np.dstack((pixels, alpha * 255)).astype(np.uint8))


def main():
    APPROVED.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    original = APPROVED/'original.png'
    if original.exists():
        assert original.read_bytes() == SOURCE.read_bytes()
    else:
        shutil.copyfile(SOURCE, original)
    source = Image.open(original).convert('RGB')
    assert source.size == (1024, 572)
    crops = {'mark': (201, 52, 874, 385), 'lockup': (201, 52, 874, 450), 'lettering': (216, 391, 807, 450)}
    images = {}
    files = []
    for kind, bounds in crops.items():
        dark = transparent_crop(source, bounds)
        for theme in ['dark', 'light']:
            result = dark.copy()
            pixels = np.array(result)
            # The original metallic shadows disappear at navigation sizes.
            # Retain the supplied geometry, with ice-white on dark surfaces
            # and deep blue on light surfaces instead of dim silver for both.
            base, scale = ((155, 180, 195), (100, 75, 60)) if theme == 'dark' else ((8, 20, 28), (36, 46, 56))
            pixels[:, :, :3] = (np.array(base) + pixels[:, :, :3].astype(np.float32) * np.array(scale) / 255).astype(np.uint8)
            result = Image.fromarray(pixels)
            target = PUBLIC/f'{PREFIX}-{kind}-{theme}.webp'
            result.save(target, lossless=True, method=6)
            images[kind, theme] = result
            files.append(target)
    icon = Image.new('RGBA', (128, 128), (9, 18, 23, 255))
    mark = images['mark', 'dark'].copy()
    mark.thumbnail((120, 120), Image.Resampling.LANCZOS)
    icon.alpha_composite(mark, ((128 - mark.width)//2, (128 - mark.height)//2))
    target = PUBLIC/f'{PREFIX}-icon.png'
    icon.save(target, optimize=True)
    files.append(target)
    # Legacy /logo.svg is also used as a silhouette by existing loading UI.
    # Keep it self-contained with transparency, rather than an external href.
    import io
    stream = io.BytesIO()
    images['mark', 'dark'].resize((256, 127), Image.Resampling.LANCZOS).save(stream, format='PNG', optimize=True)
    data = base64.b64encode(stream.getvalue()).decode('ascii')
    svg = ROOT/'web/public/logo.svg'
    svg.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 127"><image width="256" height="127" href="data:image/png;base64,{data}"/></svg>\n', encoding='utf8')
    files.append(svg)
    sheet = Image.new('RGB', (960, 600), '#0b141c')
    draw = ImageDraw.Draw(sheet)
    draw.rectangle((480, 0, 960, 600), fill='#f7f8fa')
    for column, theme in enumerate(['dark', 'light']):
        for kind, area in [('lockup', (column*480+50, 22, 380, 330)), ('mark', (column*480+45, 390, 140, 80)), ('lettering', (column*480+45, 510, 380, 44))]:
            art = images[kind, theme].copy()
            art.thumbnail(area[2:], Image.Resampling.LANCZOS)
            sheet.paste(art, (area[0], area[1]), art)
    sheet.save(OUT/'asset-review.png')
    receipt = dict(originalSHA256=hashlib.sha256(original.read_bytes()).hexdigest(), crops=crops, files=[dict(path=p.relative_to(ROOT).as_posix(), bytes=p.stat().st_size, sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in files])
    (OUT/'asset-receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(dict(files=len(files), bytes=sum(p.stat().st_size for p in files))))


if __name__ == '__main__':
    main()
