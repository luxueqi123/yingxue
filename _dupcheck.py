"""Find identifiers that are both imported and locally declared in index.tsx."""

import re
from pathlib import Path

P = 'web/src/pages/create/index.tsx'
W = Path(P).read_text(encoding='utf-8').split('\n')

imported = {}
for i, l in enumerate(W, 1):
    s = l.strip()
    if not s.startswith('import '):
        continue
    m = re.search(r'\{([\s\S]*?)\}', s)
    if not m:
        continue
    for part in m.group(1).split(','):
        part = part.strip()
        if not part:
            continue
        if ' as ' in part:
            part = part.split(' as ')[-1].strip()
        part = part.replace('type ', '').strip()
        if part:
            imported.setdefault(part, []).append(i)

decl = re.compile(r'^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|type|interface|class|enum)\s+([A-Za-z_$][\w$]*)')
declared = {}
for i, l in enumerate(W, 1):
    m = decl.match(l)
    if m:
        declared.setdefault(m.group(1), []).append(i)

dups = sorted(set(imported) & set(declared))
print('## imported AND locally declared (%d)' % len(dups))
for d in dups:
    print('   %-34s import@%s decl@%s' % (d, imported[d], declared[d]))

dupimp = sorted(n for n, v in imported.items() if len(v) > 1)
print()
print('## imported twice (%d)' % len(dupimp))
for d in dupimp:
    print('   %-34s %s' % (d, imported[d]))
