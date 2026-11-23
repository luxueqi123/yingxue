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
cache = {}
def btext(b):
    if b not in cache:
        r = subprocess.run(['git','cat-file','blob',b],capture_output=True)
        try: cache[b] = r.stdout.decode('utf-8')
        except Exception: cache[b] = None
    return cache[b]

# type/interface member names, object-literal style keys, and function params: capture "name?:" and "name:" at indentation
MEMBER = re.compile(r'^\s{2,}([A-Za-z_$][\w$]*)\??\s*[:(]', re.M)
# export/type/func/class/const decl names
DECL = re.compile(r'^\s*(?:export\s+)?(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)', re.M)
# top-level func/method names in Go
GOFUNC = re.compile(r'^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)', re.M)
GOTYPE = re.compile(r'^type\s+([A-Za-z_]\w*)', re.M)
GOMEMBER = re.compile(r'^\s+([A-Z]\w*)\s+[\w\[\]\*\.]+', re.M)

def codefile(p):
    return (p.startswith('web/src/') or p.startswith('web/test/') or p.startswith('backend/')) and p.endswith(('.ts','.tsx','.go'))

def names(p, text):
    if text is None: return set()
    s = set(MEMBER.findall(text)) | set(DECL.findall(text))
    if p.endswith('.go'):
        s = set(GOFUNC.findall(text)) | set(GOTYPE.findall(text)) | set(GOMEMBER.findall(text))
    return s

rows = []
for p in sorted(head):
    if not codefile(p): continue
    f = Path(p)
    if not f.exists(): continue
    try: tw = f.read_text(encoding='utf-8')
    except Exception: continue
    th = btext(head[p])
    if th is None or th == tw: continue
    lost = sorted(names(p, th) - names(p, tw))
    # only identifiers that look like real API names (>=6 chars, camel/Upper) to cut noise
    lost = [x for x in lost if len(x) >= 6 and x not in ('return','select','switch','delete','string','number','boolean','object','export','import','length','filter','values','reduce','Object','String','Number','Boolean','Array','Promise','Record','Partial','Readonly','context','result','params','option','config','target','source','value','index','state','props','event','error','data','items','nodes')]
    if lost: rows.append((p, lost))
rows.sort(key=lambda r: -len(r[1]))
for p, lost in rows:
    print('%-64s lost=%d' % (p, len(lost)))
    print('     ' + ', '.join(lost[:25]))
print('TOTAL files:', len(rows))
Path('.local/cache/_memberloss.txt').write_text('\n'.join('%s\t%s'%(p,','.join(l)) for p,l in rows), encoding='utf-8')
