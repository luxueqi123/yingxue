import subprocess
def tree(ref):
    out = subprocess.run(['git','ls-tree','-r',ref],capture_output=True,text=True,encoding='utf-8').stdout
    d={}
    for line in out.splitlines():
        meta,p=line.split('\t',1); d[p]=meta.split()[2]
    return d
base=tree('01a2d171'); head=tree('HEAD'); mrg=tree('b9d60f98')
idx={}
out=subprocess.run(['git','ls-files','-s'],capture_output=True,text=True,encoding='utf-8').stdout
unstaged_conf=set()
for line in out.splitlines():
    meta,p=line.split('\t',1); parts=meta.split()
    if parts[2]!='0':
        unstaged_conf.add(p); continue
    idx[p]=parts[1]
print('index entries',len(idx),'unmerged paths',len(unstaged_conf))
c=dict()
paths=set(base)|set(head)|set(mrg)
import collections
cnt=collections.Counter()
for p in sorted(paths):
    b=base.get(p); h=head.get(p); m=mrg.get(p); i=idx.get(p)
    if not i: cnt['no-index(stage!=0)']+=1; continue
    if not m: cnt['index but no merge blob']+=1; continue
    if i==m and h!=m and h!=b: cnt['SILENT-CHECK']+=1
    elif i==m: cnt['idx==merge (other)']+=1
    elif i==h: cnt['idx==head']+=1
    else: cnt['idx==neither']+=1
print(cnt)
