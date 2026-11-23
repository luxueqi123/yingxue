import subprocess,io,os,json
MT="27356091de8b043cedf9a2f65e3fc95ae42f311a"; UP="b9d60f98"; HEAD="98822b65"; BASE="01a2d171"
paths=[p for p in subprocess.run(["git","ls-tree","-r","--name-only",MT],capture_output=True,text=True,encoding="utf-8").stdout.split("\n") if p]
def batch(rev, paths):
    inp="".join(rev+":"+p+"\n" for p in paths).encode()
    pr=subprocess.run(["git","cat-file","--batch"],input=inp,capture_output=True)
    out=pr.stdout; res={}; i=0
    while i < len(out):
        j=out.index(b"\n", i)
        hdr=out[i:j].decode("utf-8","replace")
        if hdr.endswith(" missing") or " missing" in hdr:
            res[paths[len(res)]]=None
            i=j+1; continue
        parts=hdr.split()
        size=int(parts[2])
        body=out[j+1:j+1+size]
        res[paths[len(res)]]=body
        i=j+1+size+1
    return res
mt=batch(MT,paths); up=batch(UP,paths); hd=batch(HEAD,paths); ba=batch(BASE,paths)
def n(x): return x.replace(b"\r\n",b"\n") if x is not None else None
cats={}
for p in paths:
    d=io.open(p,"rb").read() if os.path.exists(p) else None
    D=n(d); M=n(mt.get(p)); U=n(up.get(p)); H=n(hd.get(p)); B=n(ba.get(p))
    if D is None: cats.setdefault("NO-DISK",[]).append(p); continue
    if M is None: continue
    if D==M: cats.setdefault("same-as-MT",[]).append(p); continue
    if U is not None and D==U:
        cats.setdefault("disk==UP(different from MT)",[]).append(p)
    elif H is not None and D==H:
        cats.setdefault("disk==HEAD",[]).append(p)
    else:
        cats.setdefault("disk==custom",[]).append(p)
for k in sorted(cats, key=lambda x:-len(cats[x])):
    print("%-34s %d" % (k, len(cats[k])))
json.dump({k:v for k,v in cats.items()}, io.open("_diskclass.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
print()
for k in ["disk==UP(different from MT)","disk==HEAD","NO-DISK","disk==custom"]:
    print("=== ",k)
    for p in sorted(cats.get(k,[]))[:60]: print("   ",p)
