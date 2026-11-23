# -*- coding: utf-8 -*-
import subprocess, os, json
GIT=r"C:\Program Files\Git\cmd\git.exe"
def sh(*a): return subprocess.run([GIT]+list(a),capture_output=True,text=True,encoding="utf-8",errors="replace").stdout.strip()
UP="b9d60f98"; YX="98822b65"; BASE="01a2d171"
plan=json.load(open("_plan5.json",encoding="utf-8"))
yx=set(x for x in sh("diff","--name-only",BASE,YX).splitlines() if x.strip())
out={"take_upstream":[],"hand":[]}
for f in plan["lost"]:
    h=sh("rev-parse","HEAD:"+f); b=sh("rev-parse",BASE+":"+f); d=sh("hash-object","--",f); u=sh("rev-parse",UP+":"+f)
    rec={"file":f,"head_eq_base":h==b,"disk_eq_head":d==h,"disk_eq_base":d==b,"in_fork_diff":f in yx}
    (out["hand"] if f in yx else out["take_upstream"]).append(rec)
json.dump(out,open("_class33.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
print("== take_upstream (映雪未改, 直接回上游) ==", len(out["take_upstream"]))
for r in out["take_upstream"]: print("   %-70s diskEqBase=%s diskEqHead=%s"%(r["file"][:70],r["disk_eq_base"],r["disk_eq_head"]))
print("== hand (映雪也改过) ==", len(out["hand"]))
for r in out["hand"]: print("   %-70s diskEqBase=%s diskEqHead=%s"%(r["file"][:70],r["disk_eq_base"],r["disk_eq_head"]))
print()
print("=== missing files: present in BASE? ===")
for f in plan["missing"]:
    inb = sh("rev-parse","--verify","--quiet",BASE+":"+f)
    inyx = sh("rev-parse","--verify","--quiet",YX+":"+f)
    print("%-60s BASE=%s YX=%s"%(f, bool(inb), bool(inyx)))
