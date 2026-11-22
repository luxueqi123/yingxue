import io,subprocess,sys,difflib
MT="27356091de8b043cedf9a2f65e3fc95ae42f311a"
def raw(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode else r.stdout.decode("utf-8","replace").replace("\r\n","\n")
p=sys.argv[1]
mt=raw(MT,p); d=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n")
print("\n".join(difflib.unified_diff(mt.split("\n"),d.split("\n"),"MT","disk",lineterm="",n=2)))
