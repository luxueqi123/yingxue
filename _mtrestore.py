import io,json,subprocess,os,shutil
MT="27356091de8b043cedf9a2f65e3fc95ae42f311a"
plan=json.load(io.open("_mt_plan_final.json",encoding="utf-8"))
os.makedirs(".local/cache/pre-mt-restore",exist_ok=True)
done=[]; skip=[]
for p,dl,ml,tt,use in plan:
    if not use: skip.append((p,"MT 也是冲突/更差")); continue
    r=subprocess.run(["git","cat-file","blob","%s:%s"%(MT,p)],capture_output=True)
    if r.returncode!=0: skip.append((p,"MT 无此文件")); continue
    body=r.stdout
    if body.startswith(b"<<<<<<<"): skip.append((p,"MT 冲突")); continue
    if os.path.exists(p): shutil.copy2(p,".local/cache/pre-mt-restore/"+p.replace("/","__"))
    io.open(p,"wb").write(body)
    done.append((p,len(body)))
print("已恢复 %d 个文件"%len(done))
for p,sz in done: print("   %7d  %s"%(sz,p))
print("\n跳过 %d:"%len(skip))
for p,why in skip: print("   %s  (%s)"%(p,why))
