# -*- coding: utf-8 -*-
import subprocess, os, json, sys
GIT=r"C:\Program Files\Git\cmd\git.exe"
def sh(*a):
    p=subprocess.run([GIT]+list(a), capture_output=True, text=True, encoding="utf-8", errors="replace")
    return p.stdout.strip()
UP="b9d60f98"; YX="98822b65"; BASE="01a2d171"
def names(*a): return [x for x in sh("diff","--name-only",*a).splitlines() if x.strip()]
up_mod=names(BASE,UP); up_del=set(names("--diff-filter=D",BASE,UP))
up_set=set(sh("ls-tree","-r","--name-only",UP).splitlines())
yx_mod=set(names(BASE,YX))
# blob hash of whole tree for UP is too slow; use git hash-object on disk vs git rev-parse
lost=[]; hand=[]; miss=[]; ok=0
for f in up_mod:
    if f in up_del: continue
    upblob=sh("rev-parse","%s:%s"%(UP,f))
    if not os.path.exists(f):
        miss.append(f); continue
    disk=sh("hash-object","--",f)
    if upblob==disk: ok+=1; continue
    (hand if f in yx_mod else lost).append(f)
# files in UP but not in disk at all
for f in sorted(up_set):
    if not os.path.exists(f):
        if ":" in f: continue
        if f not in miss: miss.append(f)
res={"lost":lost,"hand":hand,"missing":miss,"identical_upstream":ok,"up_deleted_kept":[f for f in sorted(up_del) if os.path.exists(f)]}
json.dump(res, open("_plan5.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
print("identical-to-upstream:", ok)
print("== LOST (upstream changed, differs on disk, 映雪 untouched) ==", len(lost))
for f in lost: print("   ",f)
print("== HAND ==", len(hand))
print("== MISSING ==", len(miss))
for f in miss[:60]: print("   ",f)
