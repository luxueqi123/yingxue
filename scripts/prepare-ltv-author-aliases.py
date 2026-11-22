"""Prepare an isolated author-renaming overlay with an internal provenance receipt."""
import argparse
import hashlib
import json
from pathlib import Path
import re

from ltv_author_aliases import apply_item_aliases, build_author_map, resolve_catalog_authors


def read(path):
    return json.loads(path.read_text('utf-8'))


def write(path, value, reference=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    original = reference.read_text('utf-8') if reference else None
    compact = original is not None and original.count('\n') <= 1
    text = json.dumps(value, ensure_ascii=False, separators=(',', ':')) if compact else json.dumps(value, ensure_ascii=False, indent=2)
    if original is None or original.endswith('\n'):
        text += '\n'
    path.write_text(text, 'utf-8')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--skill-overlay', type=Path)
    parser.add_argument('--registry', type=Path)
    parser.add_argument('--provenance', type=Path)
    args = parser.parse_args()
    repo, output = args.repo.resolve(), args.output.resolve()
    if not output.is_relative_to(repo / '.local'):
        raise ValueError('Author candidate output must stay in the repository local workspace')
    registry_path = output / 'internal-author-registry.json'
    registry_source = args.registry or registry_path
    previous_registry = read(registry_source) if registry_source.exists() else {}
    prior = previous_registry.get('authors', {})
    provenance_path = output / 'internal-asset-name-map.json'
    provenance_source = args.provenance or provenance_path
    paths = [
        'web/public/production-library/catalog.json',
        'web/public/production-library/published-catalog.json',
        'web/public/production-library/case-metadata.json',
        'web/public/production-library/featured.json',
        'web/public/ltv-home/catalog.json',
    ]
    documents = [read(repo / relative) for relative in paths]
    originals = resolve_catalog_authors(documents, read(provenance_source) if provenance_source.exists() else [], prior)
    imported_by_id = {}
    for document in documents:
        for field in ('items', 'entries', 'skills'):
            for item in document.get(field, []):
                if item.get('source') == 'LibTV' and item.get('kind') != 'voice':
                    imported_by_id.setdefault(item['id'], item)
    imported = list(imported_by_id.values())
    author_map = build_author_map(originals.values(), prior)
    by_id = {identifier: author_map[original] for identifier, original in originals.items()}
    if len(by_id) != len(imported):
        raise ValueError('Duplicate source asset ID')
    write(registry_path, {**previous_registry, 'version': 1,
                         'scope': 'fictional-imported-asset-author-names-not-login-identities', 'authors': author_map})
    candidate = output / 'candidate'
    write(candidate / 'web/src/lib/ltv-asset-author-aliases.json', by_id)
    receipts = []
    for relative in paths:
        source = repo / relative
        result, count = apply_item_aliases(read(source), by_id)
        target = candidate / relative
        write(target, result, source)
        receipts.append({'path': relative, 'baselineSha256': sha(source), 'candidateSha256': sha(target), 'authorFields': count})

    relative = 'backend/internal/skills/seed/production-skills.json'
    source = repo / relative
    if args.skill_overlay:
        source = args.skill_overlay.resolve() / relative
    definitions = read(source)
    changed = 0
    for definition in definitions:
        alias = by_id.get(definition['skill_id'])
        if alias is None:
            continue
        original_name = definition['effective_user']['name']
        if original_name not in (originals[definition['skill_id']], alias):
            raise ValueError('Skill/catalog author identity mismatch: ' + definition['skill_id'])
        definition['effective_user']['name'] = alias
        old = '来源：LibTV · ' + original_name + '\n'
        if not definition['extra_info'].startswith(old):
            raise ValueError('Unexpected skill attribution prefix: ' + definition['skill_id'])
        definition['extra_info'] = '来源：LibTV · ' + alias + '\n' + definition['extra_info'][len(old):]
        changed += 1
    write(candidate / relative, definitions, repo / relative)
    receipts.append({'path': relative, 'baselineSha256': sha(repo / relative),
                     'overlayInputSha256': sha(source), 'candidateSha256': sha(candidate / relative), 'authorFields': changed})

    if args.skill_overlay:
        overlay_root = args.skill_overlay.resolve()
        for source in sorted((overlay_root / 'web/public/production-library/definitions').glob('*.json')):
            relative = source.relative_to(overlay_root).as_posix()
            definition = read(source)
            if definition['id'] != source.stem or definition['id'] not in by_id:
                raise ValueError('Unexpected cleaned skill definition: ' + relative)
            write(candidate / relative, definition, repo / relative)
            receipts.append({'path': relative, 'baselineSha256': sha(repo / relative),
                             'overlayInputSha256': sha(source), 'candidateSha256': sha(candidate / relative),
                             'authorFields': 0, 'operation': 'preserve-clean-skill-definition-overlay'})

    # A dedicated static home entry carries names outside the JSON catalogs.
    relative = 'web/src/lib/entry-showcase.ts'
    source = repo / relative
    text = source.read_text('utf-8')
    hits = []
    def replace(match):
        identifier, title, original = match.groups()
        alias = by_id.get('case-' + identifier)
        if alias is None or original not in (originals['case-' + identifier], alias):
            raise ValueError('Showcase/catalog author identity mismatch: ' + identifier)
        hits.append(identifier)
        return 'ltvWork(' + json.dumps(identifier) + ', ' + title + ', ' + json.dumps(alias, ensure_ascii=False) + ')'
    text = re.sub(r'ltvWork\("([a-f0-9]{32})", ("(?:[^"\\]|\\.)*"), "([^"\n]+)"\)', replace, text)
    if len(hits) != 9:
        raise ValueError('Showcase entry count changed; review the consumer before rewriting')
    target = candidate / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, 'utf-8')
    receipts.append({'path': relative, 'baselineSha256': sha(source), 'candidateSha256': sha(target), 'authorFields': len(hits)})

    cases = [r for r in imported if r['kind'] == 'case']
    write(output / 'internal-asset-name-map.json', [
        {'id': r['id'], 'name': r['name'], 'kind': r['kind'], 'originalAuthor': originals[r['id']], 'replacementAuthor': by_id[r['id']],
         'textFieldsPrepared': True, 'embeddedMediaNameReview': 'pending', 'publicationApproved': False}
        for r in imported])
    summary = {'sourceAssets': len(imported), 'distinctAuthors': len(set(originals.values())),
               'nicknameRegistryCount': len(author_map), 'caseAssets': len(cases),
               'distinctCaseAuthors': len({originals[r['id']] for r in cases}), 'skillSeedAuthorChanges': changed,
               'files': receipts, 'realAccountWrites': 0, 'activeSourceWrites': 0,
               'embeddedImageAndVideoNamesComplete': False, 'deployed': False}
    write(output / 'receipt.json', summary)
    print(json.dumps(summary, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
