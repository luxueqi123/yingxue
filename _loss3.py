import subprocess, difflib
from pathlib import Path

def tree(ref):
    out = subprocess.run(['git', 'ls-tree', '-r', ref], capture_output=True, text=True, encoding='utf-8').stdout
    d = {}
    for line in out.splitlines():
        meta, p = line.split('\t', 1)
        mode, typ, blob = meta.split()
        d[p] = blob
    return d

base = tree('01a2d171'); head = tree('HEAD'); mrg = tree('b9d60f98')
idx = {}
out = subprocess.run(['git', 'ls-files', '-s'], capture_output=True, text=True, encoding='utf-8').stdout
for line in out.splitlines():
    meta, p = line.split('\t', 1)
    parts = meta.split()
    if parts[2] != '0':
        continue
    idx[p] = parts[1]

cache = {}
def txt(b):
    if b not in cache:
        r = subprocess.run(['git', 'cat-file', 'blob', b], capture_output=True)
        try: cache[b] = r.stdout.decode('utf-8')
        except Exception: cache[b] = None
    return cache[b]

paths = set(base) | set(head) | set(mrg)
results = []
scanned = 0
for p in sorted(paths):
    b = base.get(p); h = head.get(p); m = mrg.get(p); i = idx.get(p)
    if not (h and m and i): continue
    if i != m: continue          # staged as THEIRS
    if h == m: continue          # no divergence
    if h == b: continue          # ours unchanged from base -> theirs simply wins
    tb = txt(b); th = txt(h); tm = txt(m)
    if tb is None or th is None or tm is None: continue
    scanned += 1
    A = tb.splitlines(); B = th.splitlines()
    added = []
    sm = difflib.SequenceMatcher(None, A, B, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag in ('replace', 'insert'):
            for line in B[j1:j2]:
                s = line.strip()
                if len(s) >= 8 and s not in ('{', '}', '};', ');', '//', '});'):
                    added.append(s)
    if not added: continue
    ms = set(x.strip() for x in tm.splitlines())
    missing = [a for a in added if a not in ms]
    if missing:
        results.append((p, len(added), len(missing), missing))
results.sort(key=lambda r: -r[2])
for p, tot, miss, sample in results:
    print('%-72s added=%d missing=%d' % (p, tot, miss))
    for s in sample[:8]: print('      -', s[:150])
print('scanned (staged==THEIRS, truly diverged):', scanned)
print('files with silent loss:', len(results))
Path('.local/cache/_loss3.txt').write_text('\n'.join('%s\t%d/%d' % (p, miss, tot) for p, tot, miss, _ in results), encoding='utf-8')
