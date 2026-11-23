import subprocess
P="web/src/pages/canvas/project.tsx"
def git(ref): return subprocess.run(["git","show",f"{ref}:{P}"],capture_output=True).stdout.decode("utf-8").replace("\r\n","\n").split("\n")
H=git("HEAD"); O=git("MERGE_HEAD")
print("HEAD len",len(H),"ORIG len",len(O))
def d(tag,ls,a,b):
    print("---",tag,a,b)
    for i in range(a-1,b):
        print("  ",i+1, len(ls[i])-len(ls[i].lstrip()), ls[i].strip()[:95])
d("HEAD",H,336,372)
d("HEAD",H,604,612)
d("HEAD",H,705,712)
d("ORIG",O,296,304)
d("ORIG",O,318,346)
d("ORIG",O,340,348)
d("ORIG",O,608,620)
d("ORIG",O,458,478)
