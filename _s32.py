import subprocess
P="web/src/pages/create/index.tsx"
def L(ref): return subprocess.run(["git","show",f"{ref}:{P}"],capture_output=True).stdout.decode("utf-8").replace("\r\n","\n").split("\n")
H=L("HEAD"); O=L("MERGE_HEAD")
print("HEAD 1-14"); 
for i in range(0,14): print("  H%d: %s"%(i+1,H[i][:120]))
print("ORIG 1-20")
for i in range(0,20): print("  O%d: %s"%(i+1,O[i][:120]))
