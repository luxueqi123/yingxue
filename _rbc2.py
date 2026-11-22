import subprocess
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
for rev in ["98822b65","b9d60f98"]:
    s=blob(rev,"web/src/services/resource-blob-cache.ts")
    lines=s.split("\n")
    print("=====",rev)
    for i,l in enumerate(lines[:130]):
        print(i+1, l)
    print()
