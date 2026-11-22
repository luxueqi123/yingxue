import subprocess,sys
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
for rev in ["98822b65","b9d60f98","27356091de8b043cedf9a2f65e3fc95ae42f311a"]:
    s=blob(rev,"web/src/services/resource-blob-cache.ts")
    print("==== ",rev, len(s) if s else -1)
    if s:
        for i,l in enumerate(s.split("\n")):
            if "游客不能读取远程媒体缓存" in l or "getActiveUserScope" in l:
                print("   ",i+1,l.strip())
