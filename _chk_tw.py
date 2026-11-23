import subprocess, difflib
def show(ref, path):
    return subprocess.run(["git","show",f"{ref}:{path}"],capture_output=True).stdout.decode("utf-8","replace").split("\n")
p="backend/internal/app/task_worker.go"
ours=show("98822b65",p); theirs=show("origin/main",p); base=show("01a2d171",p); cur=open(p,encoding="utf8").read().split("\n")
for name,a in [("base",base),("ours",ours),("theirs",theirs),("current",cur)]:
    print(name, "shouldDefer:", any("shouldDeferVideoProviderTask" in l for l in a),
          "syncExpired:", any("newAPIChannel2TaskSyncExpired" in l for l in a),
          "maxAge:", any("newAPIChannel2TaskSyncMaxAge" in l for l in a))
d=[l for l in difflib.unified_diff(ours,theirs,lineterm="",n=0) if l.startswith(("+","-")) and not l.startswith(("+++","---"))]
print("ours->theirs changed lines:", len(d))
print("\n".join(dash for dash in d[:60]))
