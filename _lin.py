import subprocess
def has(rev,p):
    r=subprocess.run(["git","cat-file","-e","%s:%s"%(rev,p)],capture_output=True)
    return r.returncode==0
def marks(rev,p,keys):
    r=subprocess.run(["git","cat-file","blob","%s:%s"%(rev,p)],capture_output=True)
    if r.returncode!=0: return None
    s=r.stdout.decode("utf-8","replace")
    return {k:s.count(k) for k in keys if s.count(k)}
revs=[("base","01a2d171"),("head","98822b65"),("up","b9d60f98")]
files=["web/src/lib/desktop-local-channel.ts","web/src/services/local-dreamina-generation.ts","web/src/services/api/generation-task.ts","web/src/components/canvas/canvas-node-mask-edit-dialog.tsx"]
for p in files:
    print("###",p)
    for n,r in revs:
        print("   ",n,"exists" if has(r,p) else "MISSING")
print()
print("=== base generation-task markers ===")
print(marks("01a2d171","web/src/services/api/generation-task.ts",["runLocalDreaminaGeneration","usesLocalDreamina","allowLocalChannel","comfyBridgeActive"]))
print("=== base merge-base check ===")
print(subprocess.run(["git","merge-base","98822b65","b9d60f98"],capture_output=True).stdout)
print(subprocess.run(["git","log","--oneline","-3","01a2d171"],capture_output=True).stdout.decode())
