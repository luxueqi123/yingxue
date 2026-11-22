import subprocess
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def L(b): return b.replace(b"\r\n",b"\n").decode("utf-8","replace").splitlines()
p="web/src/pages/canvas/project.tsx"
up=L(blob("MERGE_HEAD",p)); dk=L(open(p,"rb").read())
def block(lines):
    for i,l in enumerate(lines):
        if l.strip().startswith("<CanvasNodePromptPanel"): return i,lines[i:i+40]
    return None,None
i0,blk=block(up)
print("=== 上游 project.tsx 的 CanvasNodePromptPanel 调用块 ===")
for l in blk: print("  ",l[:160])
