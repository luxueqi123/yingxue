import subprocess, re
from pathlib import Path

def tree(ref):
    out = subprocess.run(['git','ls-tree','-r',ref],capture_output=True,text=True,encoding='utf-8').stdout
    d = {}
    for line in out.splitlines():
        meta, p = line.split('\t', 1)
        d[p] = meta.split()[2]
    return d

base = tree('01a2d171'); head = tree('HEAD'); mrg = tree('b9d60f98')
cache = {}
def btext(b):
    if b not in cache:
        r = subprocess.run(['git','cat-file','blob',b],capture_output=True)
        try: cache[b] = r.stdout.decode('utf-8')
        except Exception: cache[b] = None
    return cache[b]

def wtext(p):
    f = Path(p)
    if not f.exists(): return None
    try: return f.read_text(encoding='utf-8')
    except Exception: return None

DECL = re.compile(r'\b(?:export\s+)?(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)')

def decls(text):
    return set(DECL.findall(text))

rows = []
for p in sorted(set(base) | set(head)):
    h = head.get(p)
    if not h: continue
    th = btext(h); tw = wtext(p)
    if tw is None: continue
    if th == tw: continue
    lost = sorted(decls(th) - decls(tw))
    if lost:
        rows.append((p, lost))

rows.sort(key=lambda r: -len(r[1]))
for p, lost in rows:
    print('%-72s lost=%d' % (p, len(lost)))
    print('     ' + ', '.join(lost))
print('TOTAL files:', len(rows))
Path('.local/cache/_final_loss.txt').write_text('\n'.join('%s\t%s' % (p, ','.join(l)) for p, l in rows), encoding='utf-8')
