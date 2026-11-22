import subprocess,io,os,json,sys
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
MT="27356091de8b043cedf9a2f65e3fc95ae42f311a"
HEAD="98822b65"; UP="b9d60f98"; BASE="01a2d171"
paths=[l.strip() for l in io.open("_mtsafe.txt",encoding="utf-8") if l.strip()]
# rebuild full divergent list
allp=[p for p in subprocess.run(["git","ls-tree","-r","--name-only",MT],capture_output=True,text=True,encoding="utf-8").stdout.split("\n") if p]
res=[]
for p in allp:
    h=blob(HEAD,p); u=blob(UP,p); b=blob(BASE,p)
    if h is None or u is None or b is None: continue
    if h==u or h==b: continue   # 映雪没改过这个文件 -> 不算丢失
    d=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n") if os.path.exists(p) else ""
    yx=[x.rstrip() for x in h.split("\n") if x.strip() and x.strip() not in set(y.rstrip() for y in b.split("\n"))]
    ds=set(x.rstrip() for x in d.split("\n"))
    yx2=[x for x in yx if x in set(x.rstrip() for x in u.split("\n"))]
    lost=[x for x in yx if x not in ds]
    if lost: res.append((p,len(lost),len(yx),lost))
res.sort(key=lambda r:-r[1])
print("files where 映雪改动行丢失:",len(res))
for p,n,t,l in res: print("%5d / %5d   %s"%(n,t,p))
json.dump([[p,n,t,l] for p,n,t,l in res], io.open("_yx_lost.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
