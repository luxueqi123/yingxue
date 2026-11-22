import subprocess,io,difflib
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
p="web/src/components/layout/workspace-sidebar-nav.tsx"
d=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n")
h=blob("98822b65",p)
print("===== DISK (current, %d lines)"%len(d.split("\n")))
for i,l in enumerate(d.split("\n")): print("%4d| %s"%(i+1,l))
