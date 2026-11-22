import subprocess,io
MT="27356091de8b043cedf9a2f65e3fc95ae42f311a"
for p in ["web/src/components/layout/workspace-sidebar-nav.tsx","web/src/pages/create/index.tsx"]:
    m=subprocess.run(["git","cat-file","blob","%s:%s"%(MT,p)],capture_output=True).stdout.decode("utf-8","replace").replace("\r\n","\n")
    lines=m.split("\n")
    idx=[i for i,x in enumerate(lines) if x.startswith("<<<<<<<")]
    print("###",p,"conflicts:",len(idx),"lines:",len(lines))
