import subprocess,sys,difflib
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
p=sys.argv[1]
a=blob("98822b65",p); b=blob("b9d60f98",p)
print("HEAD len",len(a),"UP len",len(b))
for l in difflib.unified_diff(a.split("\n"),b.split("\n"),"HEAD","UP",lineterm="",n=1): print(l)
