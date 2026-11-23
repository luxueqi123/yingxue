import subprocess
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def L(b): return b.replace(b"\r\n",b"\n").decode("utf-8","replace").splitlines()
t="web/test/create-library-button.test.ts"
for rev in ["HEAD","MERGE_HEAD"]:
    s=L(blob(rev,t)); print("### %s test lines 50-70"%rev)
    for i,l in enumerate(s[48:70],49): print("  ",i,l[:150])
print()
c="web/src/components/canvas/canvas-node-prompt-panel.tsx"
up=L(blob("MERGE_HEAD",c))
for i,l in enumerate(up,1):
    if "onInsert" in l: print("  UP %d: %s"%(i,l[:170]))
