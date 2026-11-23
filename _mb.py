import subprocess
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
p="web/src/lib/generation-task-display.ts"
base=blob("01a2d171",p); head=blob("98822b65",p); up=blob("b9d60f98",p)
print("BASE len",len(base or ""),"HEAD len",len(head or ""),"UP len",len(up or ""))
print("BASE has dreamina:", "dreamina-cli" in (base or ""))
print("HEAD==BASE:", base==head)
print("UP==BASE:", base==up)
