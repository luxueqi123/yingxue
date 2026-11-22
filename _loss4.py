import subprocess
from pathlib import Path
def tree(ref):
    out = subprocess.run(['git','ls-tree','-r',ref],capture_output=True,text=True,encoding='utf-8').stdout
    d={}
    for line in out.splitlines():
        meta,p=line.split('\t',1); d[p]=meta.split()[2]
    return d
base=tree('01a2d171'); head=tree('HEAD'); mrg=tree('b9d60f98')
idx={}
out=subprocess.run(['git','ls-files','-s'],capture_output=True,text=True,encoding='utf-8').stdout
conf=set()
for line in out.splitlines():
    meta,p=line.split('\t',1); parts=meta.split()
    if parts[2]!='0': conf.add(p); continue
    idx[p]=parts[1]
# case 1: HEAD has it, MERGE deleted it -> ours should survive with HEAD blob
deleted_by_merge=[]
for p,h in head.items():
    if p in mrg: continue
    i=idx.get(p)
    if i is None: deleted_by_merge.append((p,'GONE',h)); continue
    if i!=h: deleted_by_merge.append((p,'MODIFIED',h))
print('=== HEAD files dropped/modified while MERGE lacks them:',len(deleted_by_merge))
for p,st,h in deleted_by_merge: print('  ',st,p)
# case 2: MERGE has it, HEAD doesn't -> upstream-introduced, should be present in index
newc=[]
for p,m in mrg.items():
    if p in head: continue
    i=idx.get(p)
    if i is None: newc.append((p,'MISSING-INDEX'))
    elif i!=m: newc.append((p,'MODIFIED'))
print('=== MERGE files absent from HEAD:',len(newc), ' anomalous:',sum(1 for _,s in newc if s!='MISSING-INDEX'))
for p,s in newc:
    if s!='MISSING-INDEX': print('  ',s,p)
# case 3: both have it, and index equals base? (dropped both changes)
both=[]
for p in head:
    if p not in mrg: continue
    i=idx.get(p); b=base.get(p)
    if i==b and head[p]!=b and mrg[p]!=b: both.append(p)
print('=== index reverted to BASE while both sides changed:',len(both))
for p in both: print('  ',p)
