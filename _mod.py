import os,subprocess
def has(p): return os.path.exists(p)
files=["web/src/pages/settings/agent-memory-pane.tsx",
       "web/src/components/layout/collection-toolbar.tsx",
       "web/src/pages/admin/components/admin-ui.tsx",
       "backend/internal/app/channel_outbound.go"]
for f in files:
    r=subprocess.run(["git","cat-file","-e","MERGE_HEAD:"+f],capture_output=True)
    r2=subprocess.run(["git","cat-file","-e","HEAD:"+f],capture_output=True)
    print("%-56s disk=%-5s UP=%-5s HEAD=%s"%(f,has(f),r.returncode==0,r2.returncode==0))
