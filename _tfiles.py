import subprocess, io, re, collections
def sh(a):
    return subprocess.run(a, capture_output=True, text=True, encoding="utf-8", errors="replace").stdout
base = sh(["git","ls-tree","-r","--name-only","bdd61bbf","--","web/test"]).split()
up   = sh(["git","ls-tree","-r","--name-only","b9d60f98","--","web/test"]).split()
head = sh(["git","ls-tree","-r","--name-only","98822b65","--","web/test"]).split()
b=set(x.replace("web/","") for x in base); u=set(x.replace("web/","") for x in up); h=set(x.replace("web/","") for x in head)
print("baseline test files:", len(b), "upstream:", len(u), "head:", len(h))
print("HEAD only:", len(h-u), sorted(h-u))
print()
print("UP only:", len(u-h))
