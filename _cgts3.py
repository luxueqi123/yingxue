import io,subprocess,os,shutil,re
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout if r.returncode==0 else None
def n(x): return x.replace(b"\r\n",b"\n") if x is not None else None
# canvas-generation-task-sync: 磁盘版已被 MT 换回，含冲突标记 -> 重新处理
p="web/src/lib/canvas/canvas-generation-task-sync.ts"
s=io.open(p,encoding="utf-8",errors="replace").read()
print("has conflict:", "<<<<<<< " in s)
bak=".local/cache/pre-mt-restore/"+p.replace("/","__")
print("bak exists:", os.path.exists(bak))
io.open("_cgts_dump.txt","w",encoding="utf-8").write(s)
# diff bak vs MT
if os.path.exists(bak):
    old=io.open(bak,encoding="utf-8",errors="replace").read().replace("\r\n","\n")
    import difflib
    for l in difflib.unified_diff(old.split("\n"),s.replace("\r\n","\n").split("\n"),"bak","MT",lineterm="",n=1): print(l[:200])
