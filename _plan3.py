# -*- coding: utf-8 -*-
import subprocess, os, json, sys
def run(*a):
    return subprocess.run(a, capture_output=True, text=True, encoding="utf-8", errors="replace").stdout
UP="b9d60f98"; YX="98822b65"; BASE="01a2d171"
up_files=set(run("git","diff","--name-only",BASE,UP).splitlines())
yx_files=set(run("git","diff","--name-only",BASE,YX).splitlines())
res={"take_upstream":[], "handmerge":[], "missing_on_disk":[], "upstream_deleted":[]}
for f in sorted(up_files):
    f=f.strip()
    if not f: continue
    upblob=run("git","show","%s:%s"%(UP,f))
    disk=None
    if os.path.isfile(f):
        try: disk=open(f,encoding="utf-8",errors="replace",newline="").read()
        except Exception: disk=None
    if disk is None:
        if run("git","cat-file","-e","%s:%s"%(UP,f)) is not None:
            res["missing_on_disk"].append(f)
        continue
    # normalize CRLF
    n=lambda s: s.replace("\r\n","\n")
    if n(upblob)==n(disk): continue
    if f in yx_files: res["handmerge"].append(f)
    else: res["take_upstream"].append(f)
# upstream deletions (base..UP) that 映雪 still has
for f in run("git","diff","--name-only","--diff-filter=D",BASE,UP).splitlines():
    f=f.strip()
    if f and os.path.exists(f): res["upstream_deleted"].append(f)
json.dump(res, open("_resolved_plan.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
print("take_upstream(底座丢失,映雪未改):", len(res["take_upstream"]))
for f in res["take_upstream"]: print("   ", f)
print("handmerge(双方都改):", len(res["handmerge"]))
for f in res["handmerge"]: print("   ", f)
print("missing_on_disk:", len(res["missing_on_disk"]))
for f in res["missing_on_disk"]: print("   ", f)
print("upstream_deleted_but_disk_has:", len(res["upstream_deleted"]))
for f in res["upstream_deleted"]: print("   ", f)
