import subprocess
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def L(b): return b.replace(b"\r\n",b"\n").decode("utf-8","replace").splitlines()
c="web/src/components/canvas/canvas-node-prompt-panel.tsx"
up=L(blob("MERGE_HEAD",c))
for i,l in enumerate(up,1):
    if "ConnectedReferenceShelf" in l or "insertPromptReference" in l or "mediaEnhancement" in l:
        print("  UP %4d: %s"%(i,l[:160]))
