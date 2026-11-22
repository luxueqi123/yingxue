import subprocess, re
from pathlib import Path

def tree(ref):
    out = subprocess.run(['git','ls-tree','-r',ref],capture_output=True,text=True,encoding='utf-8').stdout
    d = {}
    for line in out.splitlines():
        meta, p = line.split('\t', 1)
        d[p] = meta.split()[2]
    return d

head = tree('HEAD')
# restrict to code files under web/ and backend/
def codefile(p):
    return (p.startswith('web/src/') or p.startswith('web/test/') or p.startswith('backend/')) and p.endswith(('.ts','.tsx','.go'))

# determine which paths differ between HEAD blob and worktree content (by hash)
def workhash(p):
    r = subprocess.run(['git','hash-object',p],capture_output=True,text=True,encoding='utf-8')
    return r.stdout.strip() if r.returncode == 0 else None

DECL = re.compile(r'\b(?:export\s+)?(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)')
cache = {}
def btext(b):
    if b not in cache:
        r = subprocess.run(['git','cat-file','blob',b],capture_output=True)
        try: cache[b] = r.stdout.decode('utf-8')
        except Exception: cache[b] = None
    return cache[b]

rows = []
cands = [p for p in head if codefile(p) and Path(p).exists()]
for p in sorted(cands):
    h = head[p]
    wh = workhash(p)
    if wh is None or wh == h: continue
    th = btext(h)
    try: tw = Path(p).read_text(encoding='utf-8')
    except Exception: continue
    if th == tw: continue
    lost = sorted(set(DECL.findall(th)) - set(DECL.findall(tw)))
    if lost:
        rows.append((p, lost))
rows.sort(key=lambda r: -len(r[1]))
for p, lost in rows:
    print('%-70s lost=%d' % (p, len(lost)))
    print('     ' + ', '.join(lost))
print('TOTAL files:', len(rows))
Path('.local/cache/_final_loss2.txt').write_text('\n'.join('%s\t%s' % (p, ','.join(l)) for p, l in rows), encoding='utf-8')
