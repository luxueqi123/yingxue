import subprocess,io,os,json
MT="27356091de8b043cedf9a2f65e3fc95ae42f311a"; UP="b9d60f98"; HEAD="98822b65"; BASE="01a2d171"
paths=[p for p in subprocess.run(["git","ls-tree","-r","--name-only",MT],capture_output=True,text=True,encoding="utf-8").stdout.split("\n") if p]
def batch(rev, paths):
    inp="".join(rev+":"+p+"\n" for p in paths).encode()
    pr=subprocess.run(["git","cat-file","--batch"],input=inp,capture_output=True)
    out=pr.stdout; res={}; i=0; idx=0
    while i < len(out) and idx < len(paths):
        j=out.index(b"\n", i)
        hdr=out[i:j].decode("utf-8","replace")
        if hdr.endswith(" missing"):
            res[paths[idx]]=None; idx+=1; i=j+1; continue
        size=int(hdr.split()[2])
        res[paths[idx]]=out[j+1:j+1+size]; idx+=1; i=j+1+size+1
    return res
H=batch(HEAD,paths); U=batch(UP,paths); B=batch(BASE,paths)
def n(x): return x.decode("utf-8","replace").replace("\r\n","\n") if x is not None else None
res=[]
for p in paths:
    h=n(H.get(p)); u=n(U.get(p)); b=n(B.get(p))
    if p=="web/src/lib/canvas/ltv-kling-options.ts": pass
    if h is None or u is None or b is None: continue
    if h==u: continue          # 映雪没改 -> 跳过
    dpath=p
    if not os.path.exists(dpath):
        res.append((p,"NO-DISK",0,0,[])); continue
    d=n(io.open(dpath,"rb").read())
    if d is None: continue
    bset=set(x.rstrip() for x in b.split("\n"))
    yx=[x.rstrip() for x in h.split("\n") if x.strip() and x.rstrip() not in bset]
    if not yx: continue        # 映雪在这个文件里没有独占行
    ds=set(x.rstrip() for x in d.split("\n"))
    lost=[x for x in yx if x not in ds]
    if lost: res.append((p,"LOST",len(lost),len(yx),lost))
res.sort(key=lambda r:-r[2])
print("映雪独占行被丢弃的文件数:",len(res))
tot=0
for p,k,nn,tt,l in res:
    tot+=nn
    print("%5d / %5d   %s"%(nn,tt,p))
print("TOTAL lost lines:",tot)
json.dump([[p,k,nn,tt,l] for p,k,nn,tt,l in res], io.open("_yx_lost.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
