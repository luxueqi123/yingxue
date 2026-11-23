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
safe=[]; unsafe=[]; conf=[]
for p in paths:
    m=n(M.get(p)); h=n(H.get(p)); u=n(U.get(p)); b=n(B.get(p))
    if m is None: continue
    if m.startswith("<<<<<<<"): conf.append(p); continue
    if h is None or u is None or b is None: continue
    if h==u: continue
    hs=set(x.rstrip() for x in h.split("\n") if x.strip())
    ms=set(x.rstrip() for x in m.split("\n") if x.strip())
    lost=[x for x in hs if x not in ms]
    if lost: unsafe.append((p,len(lost)))
    else: safe.append(p)
print("MT 保留全部 HEAD 行的文件数:",len(safe))
for p in safe: print("   ",p)
print("\nMT 丢 HEAD 行:",len(unsafe))
print("冲突:",conf)
json.dump({"safe":safe,"unsafe":[p for p,_ in unsafe],"conf":conf}, io.open("_mtplan2.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
