import subprocess, re, hashlib
from pathlib import Path

def tree(ref):
    out = subprocess.run(['git','ls-tree','-r',ref],capture_output=True,text=True,encoding='utf-8').stdout
    d = {}
    for line in out.splitlines():
        meta, p = line.split('\t', 1)
        d[p] = meta.split()[2]
    return d

head = tree('HEAD')
EXPORT = re.compile(r'^export\s+(?:declare\s+)?(?:async\s+)?(?:default\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)', re.M)
EXPORT2 = re.compile(r'^export\s*\{([^}]*)\}', re.M)
cache = {}
def btext(b):
    if b not in cache:
        r = subprocess.run(['git','cat-file','blob',b],capture_output=True)
        try: cache[b] = r.stdout.decode('utf-8')
        except Exception: cache[b] = None
    return cache[b]

def exports(text):
    if text is None: return set()
    s = set(EXPORT.findall(text))
    for m in EXPORT2.finditer(text):
        for part in m.group(1).split(','):
            name = part.strip().split(' as ')[-1].strip()
            if name: s.add(name)
    return s

def codefile(p):
    return (p.startswith('web/src/') or p.startswith('web/test/') or p.startswith('backend/')) and p.endswith(('.ts','.tsx','.go'))

def goexports(text):
    if text is None: return set()
    return set(re.findall(r'^func\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)', text, re.M)) | set(re.findall(r'^type\s+([A-Za-z_][\w]*)', text, re.M))

rows = []
for p in sorted(head):
    if not codefile(p): continue
    f = Path(p)
    if not f.exists(): continue
    try: tw = f.read_text(encoding='utf-8')
    except Exception: continue
    th = btext(head[p])
    if th is None or th == tw: continue
    if p.endswith('.go'): lost = sorted(goexports(th) - goexports(tw))
    else: lost = sorted(exports(th) - exports(tw))
    # keep only exported names (Go: capitalized; TS: already exported)
    if p.endswith('.go'):
        lost = [x for x in lost if x[:1].isupper()]
    if lost: rows.append((p, lost))
rows.sort(key=lambda r: -len(r[1]))
for p, lost in rows:
    print('%-68s lost=%d' % (p, len(lost)))
    print('     ' + ', '.join(lost))
print('TOTAL files with exported loss:', len(rows))
Path('.local/cache/_exploss.txt').write_text('\n'.join('%s\t%s' % (p, ','.join(l)) for p, l in rows), encoding='utf-8')
