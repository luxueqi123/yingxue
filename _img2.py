import subprocess,io,difflib
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
p="web/src/services/api/image.ts"
u=blob("b9d60f98",p)
d=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n")
print("disk==UP:", d==u)
for l in difflib.unified_diff(u.split("\n"),d.split("\n"),"UP","disk",lineterm="",n=2): print(l[:200])
