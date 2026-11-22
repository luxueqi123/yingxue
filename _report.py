import subprocess,io,os,json
MT="27356091de8b043cedf9a2f65e3fc95ae42f311a"; UP="b9d60f98"; HEAD="98822b65"; BASE="01a2d171"
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
H=batch(HEAD); U=batch(UP); B=batch(BASE)
def n(x): return x.decode("utf-8","replace").replace("\r\n","\n") if x is not None else None
report=[]; tot=0
for p in paths:
    h=n(H.get(p)); u=n(U.get(p)); b=n(B.get(p))
    if h is None or u is None or b is None: continue
    if h==u: continue
    if not os.path.exists(p): continue
    d=n(io.open(p,"rb").read())
    bset=set(x.rstrip() for x in b.split("\n"))
    yx=[x.rstrip() for x in h.split("\n") if x.strip() and x.rstrip() not in bset]
    if not yx: continue
    ds=set(x.rstrip() for x in d.split("\n"))
    lost=[x for x in yx if x not in ds]
    if lost:
        report.append((p,len(lost),len(yx),lost)); tot+=len(lost)
report.sort(key=lambda r:-r[1])
w=io.open("_REPORT.txt","w",encoding="utf-8")
w.write("文件数=%d 丢失映雪行=%d\n"%(len(report),tot))
for p,nn,tt,l in report:
    w.write("\n===== %s  (丢失 %d / 映雪改动 %d)\n"%(p,nn,tt))
    for x in l: w.write("  - "+x[:220]+"\n")
w.close()
print("文件数=%d 丢失映雪行=%d"%(len(report),tot))
