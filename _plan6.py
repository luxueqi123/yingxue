# -*- coding: utf-8 -*-
import subprocess, os, json
GIT=r"C:\Program Files\Git\cmd\git.exe"
def sh(*a): return subprocess.run([GIT]+list(a),capture_output=True,text=True,encoding="utf-8",errors="replace").stdout.strip()
UP="b9d60f98"; YX="98822b65"; BASE="01a2d171"
yx=set(x for x in sh("diff","--name-only",BASE,YX).splitlines() if x.strip())
print("映雪 fork modified/added/deleted files vs base:", len(yx))
plan=json.load(open("_plan5.json",encoding="utf-8"))
print("lost:",len(plan["lost"]),"hand:",len(plan["hand"]))
# for lost files: is HEAD:file == BASE:file?
for f in plan["lost"]:
    h=sh("rev-parse","HEAD:"+f); b=sh("rev-parse",BASE+":"+f); d=sh("hash-object","--",f); u=sh("rev-parse",UP+":"+f)
    tag = "HEAD==BASE" if h==b else "HEAD!=BASE"
    print("%-72s %s disk==HEAD:%s disk==UP:%s"%(f[:72],tag,d==h,d==u))
