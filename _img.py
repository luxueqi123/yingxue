import subprocess,io,difflib
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
p="web/src/services/api/image.ts"
h=blob("98822b65",p); u=blob("b9d60f98",p)
print("HEAD %d  UP %d"%(len(h),len(u)))
for l in difflib.unified_diff(u.split("\n"),h.split("\n"),"UP","HEAD",lineterm="",n=2): print(l[:200])
