import subprocess, re, hashlib
from pathlib import Path

def tree(ref):
    out = subprocess.run(['git','ls-tree','-r',ref],capture_output=True,text=True,encoding='utf-8').stdout
    d = {}
    for line in out.splitlines():
        meta, p = line.split('\t', 1)
        d[p] = meta.split()[2]
    return d

def githash(data: bytes):
    h = hashlib.sha1()
    h.update(b'blob %d\0' % len(data))
    h.update(data)
    return h.hexdigest()

head = tree('HEAD')
DECL = re.compile(r'\b(?:export\s+)?(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)')
cache = {}
def btext(b):
    if b not in cache:
        r = subprocess.run(['git','cat-file','blob',b],capture_output=True)
        try: cache[b] = r.stdout.decode('utf-8')
        except Exception: cache[b] = None
    return cache[b]

def codefile(p):
    return (p.startswith('web/src/') or p.startswith('web/test/') or p.startswith('backend/')) and p.endswith(('.ts','.tsx','.go'))

rows = []
n = 0
for p in sorted(head):
    if not codefile(p): continue
    f = Path(p)
    if not f.exists(): continue
    data = f.read_bytes()
    if githash(data) == head[p]: continue
    n += 1
    try: tw = data.decode('utf-8')
    except Exception: continue
    th = btext(head[p])
    if th is None or th == tw: continue
    lost = sorted(set(DECL.findall(th)) - set(DECL.findall(tw)))
    if lost: rows.append((p, lost))
rows.sort(key=lambda r: -len(r[1]))
for p, lost in rows:
    print('%-70s lost=%d' % (p, len(lost)))
    print('     ' + ', '.join(lost))
print('changed files scanned:', n, 'files with lost decls:', len(rows))
Path('.local/cache/_final_loss3.txt').write_text('\n'.join('%s\t%s' % (p, ','.join(l)) for p, l in rows), encoding='utf-8')
