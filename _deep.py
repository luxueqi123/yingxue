import subprocess,os
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return None if r.returncode!=0 else r.stdout
def n(b): return b.replace(b"\r\n",b"\n") if b else b
cands=["web/src/pages/settings/agent-memory-pane.tsx",
       "web/src/components/layout/collection-toolbar.tsx",
       "web/src/pages/admin/components/admin-ui.tsx"]
for p in cands:
    up=blob("MERGE_HEAD",p)
    ok = up is not None and os.path.exists(p) and n(open(p,"rb").read())==n(up)
    print("%-58s UP=%s disk=%s disk==UP=%s"%(p,up is not None,os.path.exists(p),ok))
