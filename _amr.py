import subprocess, io, os, json
MT = "27356091de8b043cedf9a2f65e3fc95ae42f311a"
paths = subprocess.run(["git","ls-tree","-r","--name-only",MT],capture_output=True,text=True,encoding="utf-8").stdout.split("\n")
paths=[p for p in paths if p]
print("merged tree files:", len(paths))
res=[]
missing=0; diff=0; same=0; nodisk=0
for p in paths:
    if not os.path.exists(p):
        nodisk += 1
        continue
    d = io.open(p,"rb").read().replace(b"\r\n",b"\n")
    m = subprocess.run(["git","cat-file","blob","%s:%s"%(MT,p)],capture_output=True).stdout.replace(b"\r\n",b"\n")
    if m.startswith(b"<<<<<<<"):
        res.append((p,"CONFLICT"))
        continue
    if d==m: same+=1
    else:
        diff+=1
        mn=set(x.rstrip() for x in m.decode("utf-8","replace").split("\n") if x.strip())
        dn=set(x.rstrip() for x in d.decode("utf-8","replace").split("\n") if x.strip())
        lost=len(mn-dn); extra=len(dn-mn)
        if lost: res.append((p,"LOST:%d/%d"%(lost,extra)))
print("same:",same,"diff:",diff,"no-disk:",nodisk,"conflicts:",sum(1 for _,k in res if k=="CONFLICT"))
print()
for p,k in res: print(k, p)
json.dump(res, io.open("_automerge_vs_disk.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
