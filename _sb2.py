import io,subprocess
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
mt="27356091de8b043cedf9a2f65e3fc95ae42f311a"
p="web/src/components/layout/workspace-sidebar-nav.tsx"
s=blob(mt,p)
io.open("_mt_sidebar.txt","w",encoding="utf-8").write(s)
lines=s.split("\n")
for i,l in enumerate(lines):
    if l.startswith(("<<<<<<<","=======",">>>>>>>","|||||||")):
        print(i+1, l)
print("total",len(lines))
