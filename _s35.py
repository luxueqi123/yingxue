import subprocess
P="web/src/pages/create/index.tsx"
def L(ref): return subprocess.run(["git","show",f"{ref}:{P}"],capture_output=True).stdout.decode("utf-8").replace("\r\n","\n").split("\n")
H=L("HEAD"); O=L("MERGE_HEAD")
print("###### HEAD 52-119")
for i in range(51,119): print("H%d| %s"%(i+1,H[i]))
print("###### ORIG 29-51")
for i in range(28,51): print("O%d| %s"%(i+1,O[i]))
