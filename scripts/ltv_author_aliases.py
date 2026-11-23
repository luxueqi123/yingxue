"""Stable fictional names for imported LTV assets, never application accounts."""
import hashlib
import json


FAMILY = '林 许 程 沈 江 宋 苏 叶 顾 陆 温 白 周 季 夏 方 傅 唐 萧 简 谢 乔 宁 裴 池 余 秦 舒 祁 闻 云 孟'.split()
GIVEN = '见山 听雨 望舒 知远 予安 映川 沐青 清禾 星遥 闻溪 初晴 晚舟 云岫 书白 景澄 以宁 松月 知夏 望野 寻光 朝雨 慕川 轻舟 怀序 时安 砚秋 南栀 北辰 怀瑾 青岚 守墨 意深'.split()
FIRST = 'Rowan Avery Ellis Robin Arden Quinn Morgan Casey Emery Blair Sage Reese Taylor Cameron River Jordan Skyler Finley Eden Sydney Riley Alex Devon Jamie Lane Remy Drew Hollis Auden Marley'.split()
LAST = 'Vale Reed Finch Brooks Glen Cove Hart Wren Dale Snow Field Lake Stone Ash Grove Hale Frost Moss Fern Birch West North Gray Wells Park Bay Hill Wood Ford Lane'.split()


def name_pool():
    return [a + b for a in FAMILY for b in GIVEN] + [a + ' ' + b for a in FIRST for b in LAST]


def resolve_imported_authors(items, previous_records):
    """Recover provenance by stable asset ID after the display fields are rewritten."""
    previous = {r['id']: r for r in previous_records}
    if len(previous) != len(previous_records):
        raise ValueError('Duplicate provenance asset ID')
    result = {}
    for item in items:
        identifier, author = item['id'], item['author']
        if identifier in result:
            raise ValueError('Duplicate source asset ID')
        record = previous.get(identifier)
        if record:
            if author not in (record['originalAuthor'], record['replacementAuthor']):
                raise ValueError('Source author drift: ' + identifier)
            author = record['originalAuthor']
        result[identifier] = author
    return result


def resolve_catalog_authors(documents, previous_records, previous_aliases):
    """Include reserve-only catalogs while retaining the original per-asset identity."""
    reverse = {alias: original for original, alias in previous_aliases.items()}
    if len(reverse) != len(previous_aliases):
        raise ValueError('Duplicate fictional author names')
    result = {}
    for document in documents:
        for field in ('items', 'entries', 'skills'):
            for item in document.get(field, []):
                if item.get('source') != 'LibTV' or item.get('kind') == 'voice':
                    continue
                original = resolve_imported_authors([item], previous_records)[item['id']]
                original = reverse.get(original, original)
                if item['id'] in result and result[item['id']] != original:
                    raise ValueError('Catalog author identity mismatch: ' + item['id'])
                result[item['id']] = original
    return result


def build_author_map(authors, previous=None):
    names = sorted(set(authors))
    if any(not isinstance(name, str) or not name.strip() for name in names):
        raise ValueError('Missing source author requires an explicit asset identity')
    mapping = dict(previous or {})
    if len(set(mapping.values())) != len(mapping):
        raise ValueError('Duplicate fictional author names')
    pool = name_pool()
    reserved = set(names) | set(mapping) | set(mapping.values())
    for author in names:
        if author in mapping:
            continue
        start = int(hashlib.sha256(('yingxue-fictional-author-v1:' + author).encode()).hexdigest(), 16) % len(pool)
        for offset in range(len(pool)):
            candidate = pool[(start + offset) % len(pool)]
            if candidate not in reserved:
                mapping[author] = candidate
                reserved.add(candidate)
                break
        else:
            raise ValueError('Fictional name pool exhausted')
    return mapping


def apply_item_aliases(document, aliases):
    """Only explicit imported author fields change; IDs and graph ownership do not."""
    result = json.loads(json.dumps(document, ensure_ascii=False))
    count = 0
    for field in ('items', 'entries', 'skills'):
        for item in result.get(field, []):
            if item.get('source') != 'LibTV' or item.get('kind') == 'voice':
                continue
            identifier = item['id']
            if identifier not in aliases:
                raise ValueError('Missing alias for imported asset: ' + identifier)
            item['author'] = aliases[identifier]
            count += 1
    return result, count
