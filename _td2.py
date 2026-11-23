import subprocess
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def S(b): return b.replace(b"\r\n",b"\n").decode("utf-8","replace").split("\n")
up=S(blob("MERGE_HEAD","web/src/pages/tasks/index.tsx"))
dk=S(open("web/src/pages/tasks/index.tsx","rb").read())
print("UP",len(up),"disk",len(dk))
print("=== disk toolbar 相关行 ===")
for i,l in enumerate(dk,1):
    if "Toolbar" in l or "collection-toolbar" in l: print("  %4d %s"%(i,l[:160]))
