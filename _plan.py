import subprocess, hashlib
from pathlib import Path
def tree(ref):
    out=subprocess.run(['git','ls-tree','-r',ref],capture_output=True,text=True,encoding='utf-8').stdout
    d={}
    for line in out.splitlines():
        meta,p=line.split('\t',1); d[p]=meta.split()[2]
    return d
def gh(data):
    h=hashlib.sha1(); h.update(b'blob %d\0'%len(data)); h.update(data); return h.hexdigest()
base=tree('01a2d171'); head=tree('HEAD'); mrg=tree('b9d60f98')
rows=[l.split('\t') for l in Path('.local/cache/_exploss.txt').read_text(encoding='utf-8').strip().split('\n')]
print('%-66s %-9s %-9s %-9s %s'%('file','upstream?','disk==','ours==base','verdict'))
A=[];B=[]
for path,lost in rows:
    f=Path(path)
    dh=gh(f.read_bytes()) if f.exists() else None
    b,h,m=base.get(path),head.get(path),mrg.get(path)
    upstream_touched = (b!=m)
    if dh==m: dtag='THEIRS'
    elif dh==h: dtag='OURS'
    elif dh==b: dtag='BASE'
    else: dtag='MIXED'
    if not upstream_touched and h and f.exists():
        verdict='RESTORE-HEAD (upstream untouched)'
        A.append(path)
    else:
        verdict='MANUAL MERGE'
        B.append(path)
    print('%-66s %-9s %-9s %-9s %s'%(path,'YES' if upstream_touched else 'no',dtag,'yes' if b==h else 'no',verdict))
print()
print('RESTORE-HEAD list (%d):'%len(A))
for p in A: print('   ',p)
print('MANUAL MERGE list (%d):'%len(B))
for p in B: print('   ',p)
Path('.local/cache/_restore_head.txt').write_text('\n'.join(A),encoding='utf-8')
Path('.local/cache/_manual_merge.txt').write_text('\n'.join(B),encoding='utf-8')
