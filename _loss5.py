import subprocess, difflib, json
from pathlib import Path

def tree(ref):
    out = subprocess.run(['git','ls-tree','-r',ref],capture_output=True,text=True,encoding='utf-8').stdout
    d = {}
    for line in out.splitlines():
        meta, p = line.split('\t', 1)
        d[p] = meta.split()[2]
    return d

base = tree('01a2d171'); head = tree('HEAD'); mrg = tree('b9d60f98')
idx = {}
out = subprocess.run(['git','ls-files','-s'],capture_output=True,text=True,encoding='utf-8').stdout
for line in out.splitlines():
    meta, p = line.split('\t', 1)
    parts = meta.split()
    if parts[2] != '0': continue
    idx[p] = parts[1]

cache = {}
def txt(b):
    if b not in cache:
        r = subprocess.run(['git','cat-file','blob',b],capture_output=True)
        try: cache[b] = r.stdout.decode('utf-8')
        except Exception: cache[b] = None
    return cache[b]

# collect merged files (index != head and != merge) and staged(ours) files
groups = {'merged': [], 'ours': [], 'theirs': []}
for p in sorted(set(base)|set(head)|set(mrg)):
    b=base.get(p); h=head.get(p); m=mrg.get(p); i=idx.get(p)
    if i is None or h is None: continue
    oh = h!=b; ot = m is not None and m!=b
    if i!=h and i!=m: groups['merged'].append(p)
    elif i==h and i!=m and oh and ot: groups['ours'].append(p)
    elif i==m and i!=h and oh and ot: groups['theirs'].append(p)

def identifiers(text):
    import re
    ids = set()
    for m in re.finditer(r'\b(?:export\s+)?(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)', text):
        ids.add(m.group(1))
    for m in re.finditer(r'\bimport\s+(?:type\s+)?\{([^}]*)\}', text):
        for part in m.group(1).split(','):
            name = part.strip().split(' as ')[-1].strip()
            if name: ids.add(name)
    return ids

report = []
for p in sorted(set(groups['merged'] + groups['ours'] + groups['theirs'])):
    h=head.get(p); i=idx.get(p); m=mrg.get(p)
    th=txt(h); ti=txt(i); tm=txt(m) if m else None
    if th is None or ti is None: continue
    hi = identifiers(th); ii = identifiers(ti)
    lost = sorted(hi - ii)
    if not lost: continue
    # filter out ones that upstream renamed away and that are still referenced nowhere in our file
    report.append((p, lost))
for p, lost in report:
    print('=== %s  lost=%d' % (p, len(lost)))
    print('    ' + ', '.join(lost[:40]))
print('files with lost identifiers:', len(report))
Path('.local/cache/_loss5.txt').write_text('\n'.join('%s\t%s' % (p, ','.join(l)) for p,l in report), encoding='utf-8')
