import subprocess,json,collections,os
def tree(rev):
    r=subprocess.run(["git","ls-tree","-r","-z",rev],capture_output=True)
    out={}
    for rec in r.stdout.split(b"\0"):
        if not rec: continue
        meta,_,path=rec.partition(b"\t")
        parts=meta.split()
        if parts[1]==b"blob": out[path.decode("utf-8","replace")]=parts[2].decode()
    return out
def index():
    r=subprocess.run(["git","ls-files","-s","-z"],capture_output=True)
    out={}
    for rec in r.stdout.split(b"\0"):
        if not rec: continue
        meta,_,path=rec.partition(b"\t")
        parts=meta.split()
        out[path.decode("utf-8","replace")]=parts[1].decode()
    return out
B=tree("01a2d171"); H=tree("HEAD"); M=tree("MERGE_HEAD"); I=index()
print("base",len(B),"HEAD",len(H),"UP",len(M),"index",len(I))
adopted=[];lost=[];hand=[];missing=[]
for p,mh in M.items():
    bh=B.get(p)
    if bh==mh: continue                      # upstream 未改
    if p not in I: missing.append(p); continue
    ih=I[p]
    if ih==mh: adopted.append(p)
    elif ih==H.get(p): lost.append(p)
    else: hand.append(p)
print("upstream-modified:",len(adopted)+len(lost)+len(hand)+len(missing))
print("  采用上游(disk==UP):",len(adopted))
print("  退回映雪(disk==HEAD):",len(lost))
print("  手工合并/其他:",len(hand))
print("  索引缺失:",len(missing))
json.dump({"adopted":adopted,"lost":lost,"handmerged":hand,"missing":missing},open("_upcheck.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
for label,s in [("LOST 退回映雪",lost),("HANDMERGE",hand),("MISSING",missing)]:
    print("\n===",label,len(s),"===")
    c=collections.Counter("/".join(p.split("/")[:2]) for p in s)
    for k,v in c.most_common(18): print("   %-48s %d"%(k,v))
