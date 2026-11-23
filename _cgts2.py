import subprocess
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
for rev in ["98822b65","b9d60f98","27356091de8b043cedf9a2f65e3fc95ae42f311a"]:
    s=blob(rev,"web/src/lib/canvas/canvas-generation-task-sync.ts")
    print(rev, "len",len(s), "cacheGeneratedRemoteVideo:", "cacheGeneratedRemoteVideo" in s, "resolveMediaUrl:", s.count("resolveMediaUrl"))
