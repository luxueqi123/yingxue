import subprocess,io,os
BASE="01a2d171"; HEAD="HEAD"; UP="MERGE_HEAD"
def ls(rev):
    out=subprocess.run(["git","ls-tree","-r",rev],capture_output=True).stdout.decode("utf-8","replace").split("\n")
    d={}
    for l in out:
        if not l.strip(): continue
        meta,path=l.split("\t",1); d[path]=meta.split()[2]
    return d
b=ls(BASE); h=ls(HEAD); u=ls(UP)
paths=sorted(set(b)|set(h)|set(u))
def raw(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode else r.stdout
rows=[]
for p in paths:
    hb,hhd,hu=b.get(p),h.get(p),u.get(p)
    if hhd==hu: continue                       # 两侧一致 -> 无冲突
    if hb==hhd and hu!=hb and hu is not None: kind="UP-NEWER"      # 映雪没改，上游改了
    elif hu==hb and hhd!=hb and hhd is not None: kind="YX-ONLY"    # 上游没改，映雪改了
    elif hhd is None and hu is not None: kind="UP-ONLY-FILE"       # 映雪无此文件
    elif hu is None and hhd is not None: kind="YX-ONLY-FILE"       # 上游删了此文件
    else: kind="BOTH"
    rows.append((kind,p,hb,hhd,hu))
from collections import Counter
print(Counter(r[0] for r in rows))
io.open("_cls6.txt","w",encoding="utf-8").write("\n".join("%s|%s|%s|%s|%s"%(k,p,a or "-",c or "-",d or "-") for k,p,a,c,d in rows))
for k in ["UP-ONLY-FILE","YX-ONLY-FILE"]:
    print("----",k)
    for r in rows:
        if r[0]==k: print("   ",r[1])
