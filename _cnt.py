import io,json,subprocess,re
MT="27356091de8b043cedf9a2f65e3fc95ae42f311a"
plan=json.load(io.open("_mt_plan_final.json",encoding="utf-8"))
tot=0
for p,dl,ml,tt,use in plan:
    if not use: continue
    r=subprocess.run(["git","cat-file","blob","%s:%s"%(MT,p)],capture_output=True)
    s=r.stdout.decode("utf-8","replace")
    n=s.count("\n<<<<<<< ")+(1 if s.startswith("<<<<<<< ") else 0)
    tot+=n
    print("%4d 个冲突块  %s"%(n,p))
print("合计 %d 个冲突块"%tot)
