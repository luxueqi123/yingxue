import subprocess,io,os,json
MT="27356091de8b043cedf9a2f65e3fc95ae42f311a"
files=[e[0] for e in json.load(io.open("_final_class.json",encoding="utf-8"))["union"]] if os.path.exists("_final_class.json") else []
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
# 32 个丢失文件来自 _REPORT.txt
import re
rep=io.open("_REPORT.txt",encoding="utf-8").read()
targets=re.findall(r"\n===== (.+?)  \(丢失 (\d+) / 映雪改动 (\d+)\)",rep)
print("%-68s %6s %6s %6s %s"%("FILE","disk丢","MT丢","映雪行","用MT?"))
plan=[]
for p,dn,tt in targets:
    h=blob("98822b65",p); b=blob("01a2d171",p); m=blob(MT,p); d=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n")
    bset=set(x.rstrip() for x in (b or "").split("\n"))
    yx=[x.rstrip() for x in (h or "").split("\n") if x.strip() and x.rstrip() not in bset]
    ds=set(x.rstrip() for x in d.split("\n"))
    ms=set(x.rstrip() for x in (m or "").split("\n"))
    dl=len([x for x in yx if x not in ds]); ml=len([x for x in yx if x not in ms])
    use = (ml<dl) and (m is not None) and (not (m or "").startswith("<<<<<<<"))
    plan.append((p,dl,ml,len(yx),use))
    print("%-68s %6d %6d %6d %s"%(p[:68],dl,ml,len(yx),"YES" if use else ""))
json.dump(plan, io.open("_mt_plan_final.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
