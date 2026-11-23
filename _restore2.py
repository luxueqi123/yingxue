import io,subprocess,os,shutil
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout if r.returncode==0 else None
os.makedirs(".local/cache/pre-restore2",exist_ok=True)
targets=["web/src/pages/settings/index.tsx","web/src/pages/admin/channels/channels-page.tsx","web/src/lib/generation-task-display.ts","web/src/pages/tasks/index.tsx"]
for p in targets:
    bak=".local/cache/pre-restore2/"+p.replace("/","__")
    shutil.copy2(p,bak)
    b=blob("98822b65",p)
    io.open(p,"wb").write(b)
    print("restored HEAD ->",p,len(b))
