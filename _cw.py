import subprocess,io
p="web/src/lib/generation-workflow-execution.ts"
d=io.open(p,"rb").read()
h=subprocess.run(["git","show","98822b65:"+p],capture_output=True).stdout
print("disk len",len(d),"head len",len(h))
print("disk==head(raw):",d==h, "disk==head(norm):", d.replace(b"\r\n",b"\n")==h.replace(b"\r\n",b"\n"))
print("lines disk",d.count(b"\n"))
print(d[:120])
