import subprocess,io,os,shutil,json
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout if r.returncode==0 else None
os.makedirs(".local/cache/pre-fix3",exist_ok=True)
targets=["web/src/services/api/image-models.ts"]
for p in targets:
    shutil.copy2(p,".local/cache/pre-fix3/"+p.replace("/","__"))
    io.open(p,"wb").write(blob("98822b65",p))
    print("restored HEAD:",p)
