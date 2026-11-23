import subprocess
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def L(b): return b.replace(b"\r\n",b"\n").decode("utf-8","replace").splitlines()
c="web/src/components/canvas/canvas-node-prompt-panel.tsx"
up=L(blob("MERGE_HEAD",c))
print("=== 上游 460-480 (ConnectedReferenceShelf 调用) ===")
for i,l in enumerate(up[459:480],460): print("  ",i,l[:150])
print()
print("=== 上游 240-250 (insertPromptReference) ===")
for i,l in enumerate(up[239:250],240): print("  ",i,l[:150])
print()
print("=== 上游主组件 props 里有没有 onInsert? ===")
# main component is around line 700-760
for i,l in enumerate(up[700:770],701):
    if "onInsert" in l or "function CanvasNodePromptPanel" in l: print("  ",i,l[:150])
