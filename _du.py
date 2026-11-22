import subprocess,sys,difflib
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
p=sys.argv[1]; rev=sys.argv[2]
import io
cur=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n")
a=blob(rev,p)
for l in difflib.unified_diff(a.split("\n"),cur.split("\n"),rev,"disk",lineterm="",n=3): print(l)
