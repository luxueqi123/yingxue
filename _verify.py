import subprocess
MT="27356091de8b043cedf9a2f65e3fc95ae42f311a"
def g(rev,p):
    return subprocess.run(["git","cat-file","blob","%s:%s"%(rev,p)],capture_output=True).stdout.decode("utf-8","replace")
p="web/src/services/api/generation-task.ts"
for name,rev in [("BASE 01a2d171","01a2d171"),("HEAD 98822b65","98822b65"),("UP b9d60f98","b9d60f98"),("MERGED",MT)]:
    s=g(rev,p)
    print(name, "lines",len(s.split("\n")), "| runLocalDreamina:", s.count("runLocalDreamina"), "| usesLocalDreamina:", s.count("usesLocalDreamina"), "| allowLocalChannel:", s.count("allowLocalChannel"))
