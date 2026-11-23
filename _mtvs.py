import subprocess,io,os,json
MT="27356091de8b043cedf9a2f65e3fc95ae42f311a"; HEAD="98822b65"; UP="b9d60f98"; BASE="01a2d171"
paths=[p for p in subprocess.run(["git","ls-tree","-r","--name-only",MT],capture_output=True,text=True,encoding="utf-8").stdout.split("\n") if p]
def batch(rev):
    inp="".join(rev+":"+p+"\n" for p in paths).encode()
    out=subprocess.run(["git","cat-file","--batch"],input=inp,capture_output=True).stdout
    res={}; i=0; idx=0
    while i < len(out) and idx < len(paths):
        j=out.index(b"\n", i); hdr=out[i:j].decode("utf-8","replace")
        if hdr.endswith(" missing"):
            res[paths[idx]]=None; idx+=1; i=j+1; continue
        size=int(hdr.split()[2]); res[paths[idx]]=out[j+1:j+1+size]; idx+=1; i=j+1+size+1
    return res
M=batch(MT); H=batch(HEAD); U=batch(UP); B=batch(BASE)
def n(x): return x.decode("utf-8","replace").replace("\r\n","\n") if x is not None else None
rows=[]
for p in paths:
    m=n(M.get(p)); h=n(H.get(p)); u=n(U.get(p)); b=n(B.get(p))
    if h is None or u is None or b is None: continue
    if h==u: continue
    if not os.path.exists(p): continue
    if m is None or m.startswith("<<<<<<<"): continue
    d=n(io.open(p,"rb").read())
    if d==m: continue
    hs=[x.rstrip() for x in h.split("\n") if x.strip()]
    ms=set(x.rstrip() for x in m.split("\n") if x.strip())
    ds=set(x.rstrip() for x in d.split("\n"))
    mt_keeps=sum(1 for x in hs if x in ms)
    dk_keeps=sum(1 for x in hs if x in ds)
    rows.append((p,mt_keeps,dk_keeps,len(hs)))
rows.sort(key=lambda r:(r[2]-r[1]), reverse=True)
w=io.open("_MT_VS_DISK.txt","w",encoding="utf-8")
w.write("file | MT保留HEAD行 | 磁盘保留HEAD行 | HEAD总行\n")
better=0
for p,a,b2,t in rows:
    tag=""
    if b2<a: tag="  <<< MT 更好 (+%d)"%(a-b2); better+=1
    w.write("%-70s %5d %5d %5d%s\n"%(p,a,b2,t,tag))
w.close()
print("偏离 MT 的文件数:",len(rows),"其中 MT 保留更多映雪行:",better)
print(io.open("_MT_VS_DISK.txt",encoding="utf-8").read()[:6000])
