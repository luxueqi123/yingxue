import subprocess
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def n(b): return b.replace(b"\r\n",b"\n") if b else b
for p in ["web/src/components/canvas/canvas-node-prompt-panel.tsx","web/test/create-library-button.test.ts"]:
    dk=n(open(p,"rb").read())
    print(p)
    for rev in ["01a2d171","HEAD","MERGE_HEAD"]:
        b=blob(rev,p)
        print("   ",rev, "absent" if b is None else ("SAME" if n(b)==dk else "diff"))
