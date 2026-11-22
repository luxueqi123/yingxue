import subprocess,difflib
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def L(b): return b.replace(b"\r\n",b"\n").decode("utf-8","replace").splitlines()
p="web/src/pages/tasks/index.tsx"
up=L(blob("MERGE_HEAD",p))
print("=== 上游 tasks/index.tsx 里 CollectionToolbar 用法 ===")
for i,l in enumerate(up,1):
    if "CollectionToolbar" in l or "ListToolbar" in l:
        print("  %4d %s"%(i,l[:160]))
        for k in range(i,min(i+14,len(up))): print("       %s"%up[k][:150])
        print()
