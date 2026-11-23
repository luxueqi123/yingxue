import subprocess
P="web/src/pages/create/index.tsx"
def L(ref): return subprocess.run(["git","show",f"{ref}:{P}"],capture_output=True).stdout.decode("utf-8").replace("\r\n","\n").split("\n")
H=L("HEAD"); O=L("MERGE_HEAD")
def pr(tag,ls,a,b):
    print("=== %s %d-%d"%(tag,a,b))
    for i in range(a-1,b): print("%d| %s"%(i+1,ls[i]))
pr("HEAD",H,240,262)
pr("ORIG",O,155,210)
