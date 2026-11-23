import io,subprocess,difflib
def blob(rev,p):
    r=subprocess.run(["git","show","%s:%s"%(rev,p)],capture_output=True)
    return r.stdout.decode("utf-8").replace("\r\n","\n")
p="web/src/services/api/generation-task.ts"
h=blob("98822b65",p).split("\n"); u=blob("b9d60f98",p).split("\n"); b=blob("01a2d171",p).split("\n")
print("base",len(b),"head",len(h),"up",len(u))
sm=difflib.SequenceMatcher(None,b,u)
print("\n=== UP vs BASE (upstream changes) ===")
for tag,i1,i2,j1,j2 in sm.get_opcodes():
    if tag=="equal": continue
    print(f"--- {tag} base[{i1}:{i2}] -> up[{j1}:{j2}]")
    for x in b[i1:i2][:12]: print("   -",x[:170])
    for x in u[j1:j2][:14]: print("   +",x[:170])
