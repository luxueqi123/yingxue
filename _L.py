import io,json,subprocess,os
d=json.load(io.open("_yx_lost.json",encoding="utf-8"))
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
out=io.open("_L.txt","w",encoding="utf-8")
for p,k,nn,tt,l in d:
    if p.startswith("plugin-packages/") and nn>=38:
        out.write("\n########## %s  lost=%d/%d\n"%(p,nn,tt))
        for x in l: out.write("   "+x[:180]+"\n")
        # also which one wins
        u=blob("b9d60f98",p); h=blob("98822b65",p)
        out.write("   [H=%d U=%d disk=%d]\n"%(len(h or ""),len(u or ""),os.path.getsize(p) if os.path.exists(p) else -1))
out.close()
print("ok")
