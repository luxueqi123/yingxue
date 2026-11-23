import subprocess, difflib
def show(ref, path):
    return subprocess.run(["git","show",f"{ref}:{path}"],capture_output=True).stdout.decode("utf-8","replace").split("\n")
path="backend/internal/app/protocol_runtime_test.go"
base=show("01a2d171",path); ours=show("98822b65",path); theirs=show("origin/main",path)
cur=open(path,encoding="utf8").read().split("\n")
def stat(a,b,label):
    d=[l for l in difflib.unified_diff(a,b,lineterm="",n=0)]
    print(label, "changed_hunks_lines", len([x for x in d if x.startswith(("+","-")) and not x.startswith(("+++","---"))]))
stat(base,ours,"base->ours  ")
stat(base,theirs,"base->theirs")
stat(base,cur,"base->current")
stat(ours,cur,"ours->current")
stat(theirs,cur,"theirs->current")
print("current has isNewAPIChannel2TaskNotReady:", any("isNewAPIChannel2TaskNotReady" in l for l in cur))
