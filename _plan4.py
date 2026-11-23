# -*- coding: utf-8 -*-
import subprocess, os, json
def run(*a):
    p=subprocess.run(a, capture_output=True, text=True, encoding="utf-8", errors="replace")
    return p.stdout
UP="b9d60f98"; YX="98822b65"; BASE="01a2d171"
def names(*args):
    return [x.strip() for x in run("git","diff","--name-only",*args).splitlines() if x.strip()]
up_mod = names(BASE,UP)
up_del = set(names("--diff-filter=D",BASE,UP))
up_in_up = set(run("git","ls-tree","-r","--name-only",UP).splitlines())
yx_mod = set(names(BASE,YX))
n=lambda s: s.replace("\r\n","\n")
lost=[]; hand=[]; miss=[]
for f in up_mod:
    if f in up_del:  # upstream deleted it; 映雪 keeping it is a 二开-preserve decision
        continue
    upblob = run("git","show","%s:%s"%(UP,f))
    if os.path.isfile(f):
        disk = open(f,encoding="utf-8",errors="replace",newline="").read()
        if n(upblob)==n(disk): continue
        (hand if f in yx_mod else lost).append(f)
    else:
        miss.append(f)
json.dump({"lost":lost,"hand":hand,"missing":miss,"up_del_kept":[f for f in sorted(up_del) if os.path.exists(f)]}, open("_resolved_plan.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
print("== LOST base changes (upstream changed, disk differs, 映雪 untouched) ==", len(lost))
for f in lost: print("   ",f)
print("== HAND merge needed (both changed) ==", len(hand))
for f in hand: print("   ",f)
print("== MISSING on disk (in UP, absent) ==", len(miss))
for f in miss: print("   ",f)
