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
H=batch(HEAD); U=batch(UP); B=batch(BASE)
def n(x): return x.decode("utf-8","replace").replace("\r\n","\n") if x is not None else None
upwon=[]; union=[]; headwon=[]
for p in paths:
    h=n(H.get(p)); u=n(U.get(p)); b=n(B.get(p))
    if h is None or u is None or b is None: continue
    if h==u: continue          # 映雪没改这个文件
    if not os.path.exists(p): continue
    d=n(io.open(p,"rb").read())
    if d==u: upwon.append(p)
    elif d==h: headwon.append(p)
    else:
        hs=[x.rstrip() for x in h.split("\n") if x.strip()]
        ds=set(x.rstrip() for x in d.split("\n"))
        lost=[x for x in hs if x not in ds]
        union.append((p,len(lost),len(hs)))
union.sort(key=lambda r:-r[1])
print("整文件被上游覆盖 (UP-won)，共 %d 个："%len(upwon))
for p in upwon: print("   ",p)
print("\nUNION 但仍有丢失（前 25）：")
for p,nn,tt in union[:25]:
    if nn: print("   丢失 %3d/%-4d %s"%(nn,tt,p))
print("\nHEAD-won（映雪原版，未受影响）: %d 个"%len(headwon))
json.dump({"upwon":upwon,"union":union}, io.open("_final_class.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
