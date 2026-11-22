import io,subprocess,os,shutil
def blob(rev,p):
    r=subprocess.run(["git","cat-file","blob",rev+":"+p],capture_output=True)
    return r.stdout if r.returncode==0 else None
os.makedirs(".local/cache/pre-restore2",exist_ok=True)
for p in ["web/src/pages/settings/channel-settings-pane.tsx"]:
    shutil.copy2(p,".local/cache/pre-restore2/"+p.replace("/","__"))
    io.open(p,"wb").write(blob("98822b65",p))
    print("restored",p)
