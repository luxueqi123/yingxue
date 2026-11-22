import subprocess,io,os,difflib,sys
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
files=["web/src/lib/app-theme.ts","web/src/lib/generation-task-display.ts","web/src/pages/tasks/index.tsx","web/src/services/resource-blob-cache.ts"]
out=io.open("_pairs.txt","w",encoding="utf-8")
for p in files:
    h=blob("98822b65",p); u=blob("b9d60f98",p)
    out.write("\n\n########## %s (HEAD %d vs UP %d)\n"%(p,len(h or ""),len(u or "")))
    for l in difflib.unified_diff((h or "").split("\n"),(u or "").split("\n"),"HEAD","UP",lineterm="",n=1):
        out.write(l+"\n")
out.close()
print("ok")
