import subprocess,io
p="web/src/lib/canvas/canvas-generation-task-sync.ts"
h=subprocess.run(["git","show","98822b65:"+p],capture_output=True).stdout.replace(b"\r\n",b"\n")
u=subprocess.run(["git","show","b9d60f98:"+p],capture_output=True).stdout.replace(b"\r\n",b"\n")
d=io.open(p,"rb").read().replace(b"\r\n",b"\n")
print("disk==head:",d==h," disk==up:",d==u)
