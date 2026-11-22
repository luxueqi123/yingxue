# -*- coding: utf-8 -*-
import subprocess, os, json
GIT=r"C:\Program Files\Git\cmd\git.exe"
def sh(*a):
    return subprocess.run([GIT]+list(a),capture_output=True,text=True,encoding="utf-8",errors="replace").stdout
UP="b9d60f98"; YX="98822b65"; BASE="01a2d171"
plan=json.load(open("_plan5.json",encoding="utf-8"))
rows=[]
for f in plan["lost"]:
    base=sh("rev-parse","%s:%s"%(BASE,f)).strip()
    disk=sh("hash-object","--",f).strip()
    # count changed lines
    d_up=sh("diff","--numstat",BASE,UP,"--",f).strip()
    d_disk=sh("diff","--numstat",UP,"--",f).strip()  # working tree vs UP
    rows.append({"file":f,"disk_eq_base":base==disk,"base_to_up":d_up,"up_to_disk":d_disk})
json.dump(rows,open("_lost_detail.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
for r in rows:
    print("%-70s diskEqBase=%-5s base->up=%-12s up->disk=%s"%(r["file"][:70],r["disk_eq_base"],r["base_to_up"].replace("\t","/") or "0/0",r["up_to_disk"].replace("\t","/") or "0/0"))
