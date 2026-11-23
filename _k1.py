import subprocess,difflib
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def L(b): return b.replace(b"\r\n",b"\n").decode("utf-8","replace").splitlines()
for p in ["web/src/pages/canvas/use-canvas-assistant-visibility.ts","web/src/lib/generation-workflow-execution.ts"]:
    print("="*78); print("###",p)
    d=[l for l in difflib.unified_diff(L(blob("01a2d171",p)),L(blob("MERGE_HEAD",p)),"v1.2.9","v1.5.5",lineterm="",n=1)]
    for l in d[:44]: print("  ",l[:168])
    print("   (总 %d 行)"%len(d))
