import subprocess,io
def lst(rev,pre): return set(subprocess.run(["git","ls-tree","-r","--name-only",rev,"--",pre],capture_output=True,text=True,encoding="utf-8").stdout.split())
H=lst("98822b65","web/test"); U=lst("b9d60f98","web/test")
upon=sorted(x for x in U-H)
import re
mods=["canvas-generation-task-sync","generation-task\"","resource-blob-cache","canvas-media-generation-executors","generation-task'"]
for f in upon:
    r=subprocess.run(["git","show","b9d60f98:"+f],capture_output=True,text=True,encoding="utf-8",errors="replace")
    s=r.stdout
    hits=[m for m in mods if m.replace('"','').replace("'","") in s]
    if hits: print(f, hits)
