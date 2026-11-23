import subprocess
P="web/src/pages/create/index.tsx"
def L(ref): return subprocess.run(["git","show",f"{ref}:{P}"],capture_output=True).stdout.decode("utf-8").replace("\r\n","\n").split("\n")
H=L("HEAD"); O=L("MERGE_HEAD")
def pr(tag,ls,a,b):
    print("=== %s %d-%d"%(tag,a,b))
    for i in range(a-1,b): print("%d| %s"%(i+1,ls[i][:190]))
pr("HEAD",H,52,120)
pr("ORIG",O,28,52)
