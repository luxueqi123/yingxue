"""Classify every web/test file: base / ours(HEAD) / theirs(MERGE_HEAD) / worktree."""

import subprocess
from pathlib import Path

BASE = '01a2d171f5b2a6854a987ba2022a8d960d9107b4'


def n(b):
    return None if b is None else b.replace(b'\r\n', b'\n')


def blob(ref, p):
    r = subprocess.run(['git', 'show', ref + ':' + p], capture_output=True)
    return r.stdout if r.returncode == 0 else None


names = sorted(p.name for p in Path('web/test').glob('*.test.ts')) + sorted(p.name for p in Path('web/test').glob('*.test.tsx'))
print('%-52s %8s %8s %8s %8s  %s' % ('test', 'base', 'ours', 'theirs', 'work', 'resolution'))
rows = []
for nm in names:
    p = 'web/test/' + nm
    b, o, t = n(blob(BASE, p)), n(blob('HEAD', p)), n(blob('MERGE_HEAD', p))
    f = Path(p)
    w = n(f.read_bytes()) if f.exists() else None
    if o == b and t == b:
        r = 'same'
    elif t == b:
        r = 'OURS(took)' if w == o else 'OURS_MUTATED'
    elif o == b:
        r = 'theirs' if w == t else 'THEIRS_MUTATED'
    elif w == o:
        r = 'BOTH->OURS'
    elif w == t:
        r = 'BOTH->theirs'
    else:
        r = 'BOTH->merged'
    if r in ('same', 'theirs'):
        continue
    rows.append((nm, len(b or b''), len(o or b''), len(t or b''), len(w or b''), r))

for r in rows:
    print('%-52s %8d %8d %8d %8d  %s' % r)
print()
print('total differing:', len(rows), 'of', len(names))
