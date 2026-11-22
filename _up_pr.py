import subprocess
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def L(b): return b.replace(b"\r\n",b"\n").decode("utf-8","replace").splitlines()
c="web/src/components/canvas/canvas-node-prompt-panel.tsx"
up=L(blob("MERGE_HEAD",c))
print("=== 上游组件 props 定义 (665-690) ===")
for i,l in enumerate(up[664:692],665): print("  ",i,l[:150])
print()
print("=== 上游 project.tsx 中 onInsert 出现处 ===")
p="web/src/pages/canvas/project.tsx"
for i,l in enumerate(L(blob("MERGE_HEAD",p)),1):
    if "onInsert" in l: print("  ",i,l[:150])
