import subprocess
from pathlib import Path
def tree(ref):
    out = subprocess.run(['git','ls-tree','-r',ref],capture_output=True,text=True,encoding='utf-8').stdout
    d={}
    for line in out.splitlines():
        meta,p=line.split('\t',1); d[p]=meta.split()[2]
    return d
base=tree('01a2d171'); head=tree('HEAD'); mrg=tree('b9d60f98')
idx={}; conf=set()
out=subprocess.run(['git','ls-files','-s'],capture_output=True,text=True,encoding='utf-8').stdout
for line in out.splitlines():
    meta,p=line.split('\t',1); parts=meta.split()
    if parts[2]!='0': conf.add(p); continue
    idx[p]=parts[1]
groups={'ours-won (upstream also changed)':[], 'theirs-won (ours also changed)':[], 'merged/both':[], 'conflict':[]}
for p in sorted(set(base)|set(head)|set(mrg)):
    b=base.get(p); h=head.get(p); m=mrg.get(p); i=idx.get(p)
    oh = h is not None and h!=b
    ot = m is not None and m!=b
    if p in conf: groups['conflict'].append(p); continue
    if i is None: continue
    if i==h and i!=m and oh and ot: groups['ours-won (upstream also changed)'].append(p)
    elif i==m and i!=h and oh and ot: groups['theirs-won (ours also changed)'].append(p)
    elif i!=h and i!=m: groups['merged/both'].append(p)
for k,v in groups.items():
    print('###',k,len(v))
    for p in v: print('   ',p)
