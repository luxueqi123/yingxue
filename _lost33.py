# -*- coding: utf-8 -*-
import subprocess, os, json
GIT=r"C:\Program Files\Git\cmd\git.exe"
def sh(*a): return subprocess.run([GIT]+list(a),capture_output=True,text=True,encoding="utf-8",errors="replace").stdout
UP="b9d60f98"
plan=json.load(open("_class33.json",encoding="utf-8"))
rows=[]
for r in plan["take_upstream"]:
    f=r["file"]
    if not os.path.exists(f):
        rows.append({"file":f,"lost":None,"added":None}); continue
    d=sh("diff","-U0","--ignore-cr-at-eol",UP,"--",f)
    lost=added=0
    for line in d.splitlines():
        if line.startswith(("--- ","+++ ","@@","diff --git","index ")): continue
        if line.startswith("-"): lost+=1
        elif line.startswith("+"): added+=1
    rows.append({"file":f,"lost":lost,"added":added})
rows.sort(key=lambda r:(-(r["lost"] or 10**6)))
json.dump(rows,open("_lost33.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
tl=sum(r["lost"] for r in rows if r["lost"])
print("files:",len(rows)," total LOST lines:",tl)
for r in rows: print("%-72s LOST=%s"%(r["file"][:72], r["lost"]))
