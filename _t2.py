import subprocess,os
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
# 映雪 only modules
for p in ["web/src/lib/desktop-local-channel.ts","backend/internal/app/desktop_local_channel.go","web/src/lib/desktop-local-channel.test.ts"]:
    print("%-56s base=%s HEAD=%s UP=%s disk=%s"%(p,
        blob("01a2d171",p) is not None, blob("HEAD",p) is not None,
        blob("MERGE_HEAD",p) is not None, os.path.exists(p)))
