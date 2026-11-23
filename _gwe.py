import io,subprocess
def blob(rev,p):
    r=subprocess.run(["git","show","%s:%s"%(rev,p)],capture_output=True)
    return r.stdout.replace(b"\r\n",b"\n")
p="web/src/lib/generation-workflow-execution.ts"
b=blob("01a2d171",p); h=blob("98822b65",p); u=blob("b9d60f98",p)
print("base==head:", b==h, "| up!=base:", u!=b)
d=io.open(p,"rb").read().replace(b"\r\n",b"\n")
print("disk==up:", d==u, "| disk==head:", d==h)
