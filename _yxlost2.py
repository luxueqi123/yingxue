import subprocess,io,os,json
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
MT="27356091de8b043cedf9a2f65e3fc95ae42f311a"
HEAD="98822b65"; UP="b9d60f98"; BASE="01a2d171"
allp=[p for p in subprocess.run(["git","ls-tree","-r","--name-only",MT],capture_output=True,text=True,encoding="utf-8").stdout.split("\n") if p]
# only paths that differ from merge tree (we know 119) - recompute cheaply by size via ls-tree
mtsz={}
out=subprocess.run(["git","ls-tree","-r","-l",MT],capture_output=True,text=True,encoding="utf-8").stdout.split("\n")
for l in out:
    if not l.strip(): continue
    parts=l.split("\t")
    meta=parts[0].split()
    if len(meta)>=4: mtsz[parts[1]]=int(meta[3])
sel=[]
for p in allp:
    if not os.path.exists(p): continue
    d=io.open(p,"rb").read()
    if len(d)!=mtsz.get(p,-1): sel.append(p)
print("size-diff files:",len(sel))
res=[]
for p in sel:
    h=blob(HEAD,p); u=blob(UP,p); b=blob(BASE,p)
    if h is None or u is None or b is None: continue
    if h==u or h==b: continue
    d=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n")
    bset=set(x.rstrip() for x in b.split("\n"))
    yx=[x.rstrip() for x in h.split("\n") if x.strip() and x.rstrip() not in bset]
    ds=set(x.rstrip() for x in d.split("\n"))
    lost=[x for x in yx if x not in ds]
    if lost: res.append((p,len(lost),len(yx),lost))
res.sort(key=lambda r:-r[1])
print("files where 映雪改动行丢失:",len(res))
for p,n,t,l in res: print("%5d / %5d   %s"%(n,t,p))
json.dump([[p,n,t,l] for p,n,t,l in res], io.open("_yx_lost.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
