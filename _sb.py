import io,subprocess
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
p="web/src/components/layout/workspace-sidebar-nav.tsx"
mt="27356091de8b043cedf9a2f65e3fc95ae42f311a"
m=blob(mt,p)
print("MT has conflict markers:", m.startswith("<<<<<<<"), "len", len(m))
d=io.open(p,encoding="utf-8").read()
print("disk len",len(d))
print(d[:3000])
