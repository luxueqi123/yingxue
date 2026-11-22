import subprocess
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def S(b): return b.replace(b"\r\n",b"\n").decode("utf-8","replace").split("\n")
up=S(blob("MERGE_HEAD","web/src/pages/tasks/index.tsx"))
for i in range(394,430): print("UP %4d %s"%(i+1,up[i][:155]))
