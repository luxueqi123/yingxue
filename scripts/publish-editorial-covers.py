"""Package reviewed, one-to-one thematic cover art. Never calls a model."""
import argparse
import hashlib
import json
import pathlib

from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--inventory', required=True)
    parser.add_argument('--images', required=True)
    parser.add_argument('--approved', required=True)
    args = parser.parse_args()
    items = json.loads(pathlib.Path(args.inventory).read_text(encoding='utf-8'))['items']
    approved = set(json.loads(pathlib.Path(args.approved).read_text(encoding='utf-8')))
    ids = {item['id'] for item in items}
    assert len(ids) == len(items) == 108 and approved == ids, 'Every cover must be individually reviewed'
    assert {kind: sum(i['kind'] == kind for i in items) for kind in ['skill', 'template', 'workflow']} == {'skill': 72, 'template': 30, 'workflow': 6}
    images = pathlib.Path(args.images).resolve()
    output = ROOT / 'web/public/production-library/editorial-covers'
    prepared = []
    hashes = set()
    # Validate the complete input before writing any publishable file.
    for item in items:
        assert item['id'].replace('-', '').isalnum()
        assert item['target'] == f"/production-library/editorial-covers/{item['id']}.webp"
        source = images / (item['id'] + '.png')
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        assert digest not in hashes, 'Duplicate source artwork'
        hashes.add(digest)
        with Image.open(source) as image:
            image.load()
            assert image.width >= 1280 and image.height >= 720
            prepared.append((item, digest, ImageOps.exif_transpose(image).convert('RGB')))
    output.mkdir(parents=True, exist_ok=True)
    records = []
    for item, source_hash, image in prepared:
        image.thumbnail((1600, 1200), Image.Resampling.LANCZOS)
        target = output / (item['id'] + '.webp')
        image.save(target, 'WEBP', quality=93, method=6)
        records.append({
            'id': item['id'], 'kind': item['kind'], 'name': item['name'],
            'cover': item['target'], 'prompt': item['prompt'], 'model': 'gpt-image-2.5',
            'purpose': 'original-thematic-cover-not-generated-video',
            'sourceSha256': source_hash, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
            'width': image.width, 'height': image.height, 'bytes': target.stat().st_size,
        })
    assert len({r['sha256'] for r in records}) == 108
    (output / 'manifest.json').write_text(json.dumps({'version': 1, 'entries': records}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'packaged': len(records), 'unique': len(hashes), 'bytes': sum(r['bytes'] for r in records)}))


if __name__ == '__main__':
    main()
