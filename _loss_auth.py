# -*- coding: utf-8 -*-
"""权威: 上游 v1.5.5 -> 磁盘 的「底座丢失行」统计。
- 行 = 上游有、磁盘没有 = 底座丢失
+ 行 = 磁盘独有 = 映雪二开/历史保留
"""
import subprocess, os, json
GIT=r"C:\Program Files\Git\cmd\git.exe"
def sh(*a):
    return subprocess.run([GIT]+list(a),capture_output=True,text=True,encoding="utf-8",errors="replace").stdout
UP="b9d60f98"
def names(*a): return [x for x in sh("diff","--name-only",*a).splitlines() if x.strip()]
files = names("01a2d171",UP)          # 上游 v1.2.9..v1.5.5 改过的文件
up_set = set(sh("ls-tree","-r","--name-only",UP).splitlines())
rows=[]
for f in files:
    if not os.path.exists(f):
        rows.append({"file":f,"lost":None,"added":None,"binary":False,"note":"absent-on-disk"}); continue
    d = sh("diff","-U0","--ignore-cr-at-eol",UP,"--",f)
    lost=added=0
    binary=False
    for line in d.splitlines():
        if line.startswith("Binary files") or line.startswith("GIT binary patch"):
            binary=True; continue
        if line.startswith("--- ") or line.startswith("+++ ") or line.startswith("@@"): continue
        if line.startswith("-"): lost+=1
        elif line.startswith("+"): added+=1
    rows.append({"file":f,"lost":lost,"added":added,"binary":binary})
rows.sort(key=lambda r:(-(r["lost"] if r["lost"] is not None else 10**6)))
json.dump(rows,open("_loss_authoritative.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
bad=[r for r in rows if (r["lost"] is None) or (r["lost"]>0)]
print("上游改过文件:",len(rows),"  仍有底座丢失行:",len(bad))
print("%-72s %6s %6s"%("file","LOST","added"))
for r in bad:
    print("%-72s %6s %6s%s"%(r["file"][:72], r["lost"], r["added"], "  BIN" if r["binary"] else ""))
