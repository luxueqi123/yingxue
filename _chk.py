import io,os,json,shutil
plan=json.load(io.open("_mt_plan_final.json",encoding="utf-8"))
bad=[]
for p,dl,ml,tt,use in plan:
    if not use: continue
    s=io.open(p,encoding="utf-8",errors="replace").read()
    if "<<<<<<< " in s or "\n>>>>>>> " in s or "\n=======\n" in s:
        bad.append(p)
print("恢复后仍含冲突标记的文件：%d"%len(bad))
for p in bad: print("   ",p)
# rollback
for p in bad:
    bak=".local/cache/pre-mt-restore/"+p.replace("/","__")
    if os.path.exists(bak):
        shutil.copy2(bak,p); print("已回滚",p)
