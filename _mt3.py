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
M=batch(MT); H=batch(HEAD); U=batch(UP)
def n(x): return x.decode("utf-8","replace").replace("\r\n","\n") if x is not None else None
both=[]; headonly_safe=[]
for p in paths:
    m=n(M.get(p)); h=n(H.get(p)); u=n(U.get(p))
    if m is None or m.startswith("<<<<<<<"): continue
    if h is None or u is None: continue
    if h==u: continue
    ms=set(x.rstrip() for x in m.split("\n") if x.strip())
    hl=[x.rstrip() for x in h.split("\n") if x.strip() and x.rstrip() not in ms]
    ul=[x.rstrip() for x in u.split("\n") if x.strip() and x.rstrip() not in ms]
    # only consider lines that HEAD changed vs BASE (映雪 side)
    if not hl and not ul: both.append(p)
print("MT 完整保留 HEAD+UP 独有行的文件:",len(both))
for p in both: print("   ",p)
json.dump(both, io.open("_mtsafe_both.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
