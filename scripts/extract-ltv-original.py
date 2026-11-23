"""Copy the native archive unchanged; prepare a separate read-only preview."""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path


def load(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    source, output = args.source.resolve(), args.output.resolve()
    if source == output or source in output.parents:
        raise ValueError('Output must be outside the original archive')
    repo = Path(__file__).resolve().parents[1]
    cache = repo / '.local/cache/ltv-original'
    old_cache = repo / '.local/cache/ltv-priority'
    inventory = []
    for path in source.rglob('*'):
        if not path.is_file():
            continue
        relative = path.relative_to(source)
        row = {'path': relative.as_posix(), 'bytes': path.stat().st_size}
        if relative.parts[0] == '06_案例素材':
            row['storage'] = 'read-only reference to original media'
        else:
            target = output / '原始归档' / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
            original_hash = hashlib.sha256(path.read_bytes()).hexdigest()
            row.update(storage='byte-identical copy', sha256=original_hash, verified=hashlib.sha256(target.read_bytes()).hexdigest() == original_hash)
        inventory.append(row)
    recovered = load(cache / 'recovered.json')
    mappings = {}
    for row in recovered:
        if row.get('status') != 'ok':
            continue
        target = output / '补齐依赖' / row['file']
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(cache / 'recovered' / row['file'], target)
        mappings[row['url']] = {'file': target.relative_to(output).as_posix(), 'type': row['type'], 'source': 'original dependency URL', 'sha256': row['sha256']}
    for row in load(old_cache / 'css-recovery.json'):
        target = output / '补齐依赖' / row['file']
        shutil.copy2(old_cache / 'original-css' / row['file'], target)
        mappings[row['url']] = {'file': target.relative_to(output).as_posix(), 'type': 'text/css', 'source': 'original HTML stylesheet URL', 'sha256': row['sha256']}
    configs = load(cache / 'config.json')
    for row in configs:
        if row.get('status') == 'ok':
            target = output / '补齐配置' / row['file']
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(cache / 'config' / row['file'], target)
    frontend = source / '01_前端完整工程'
    source_html = (frontend / '00_主页完整HTML.html').read_text(encoding='utf-8-sig')
    for url in re.findall(r'https://[^"<>\s]+\.js', source_html):
        filename = url.rsplit('/', 1)[-1]
        path = frontend / 'chunks' / filename
        if path.is_file():
            mappings[url] = {'file': '原始归档/01_前端完整工程/chunks/' + filename, 'type': 'application/javascript', 'source': 'original archive'}
    media = {p.name: p for p in (source / '06_案例素材').glob('*') if p.is_file()}
    detail_files = list((source / '03_官方Skill技能库/详情_完整定义').glob('*.json'))
    for p in detail_files:
        skill = load(p)['data']['skill']
        name = re.sub(r'[<>:"/\\|?*]', '_', skill['name'])
        matches = [m for m in media.values() if re.match(r'\d+_' + re.escape(name) + r'_cover\.', m.name)]
        if matches and skill.get('coverUrl'):
            mappings.setdefault(skill['coverUrl'].split('?')[0], {'sourceFile': str(matches[0]), 'source': 'original media file'})
        # Exact URL matches in original metadata remain available for future media
        # mapping; no visual replacements or guessed covers are created here.
    for name, data in [('原始文件核验.json', {'source': str(source), 'inventory': inventory}), ('资源映射.json', mappings), ('补齐配置.json', configs)]:
        (output / name).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'copiedOriginalFiles': sum(r.get('verified', False) for r in inventory), 'originalFileCount': len(inventory), 'originalMediaReferences': sum(r['storage'].startswith('read-only') for r in inventory), 'resourceMappings': len(mappings), 'configSnapshots': len(configs), 'output': str(output)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
