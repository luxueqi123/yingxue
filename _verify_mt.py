import subprocess,io,difflib,os
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout.decode("utf-8","replace").replace("\r\n","\n") if r.returncode==0 else None
for p in ["web/src/lib/canvas/canvas-generation-task-sync.ts","web/src/pages/canvas/use-canvas-generation.ts","web/src/pages/canvas/project.tsx","web/src/components/canvas/canvas-node-prompt-panel.tsx"]:
    bak=".local/cache/pre-mt-restore/"+p.replace("/","__")
    if not os.path.exists(bak): print("no bak",p); continue
    old=io.open(bak,encoding="utf-8",errors="replace").read().replace("\r\n","\n")
    new=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n")
    d=[l for l in difflib.unified_diff(old.split("\n"),new.split("\n"),"disk-old","MT-new",lineterm="",n=1)]
    print("\n########## %s  (%d diff lines)"%(p,len(d)))
    for l in d[:40]: print("  ",l[:190])
