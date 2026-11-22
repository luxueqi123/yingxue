import subprocess, hashlib
M=r"D:\天琊书客\项目\天琊映雪无限画布"
def main(p):
    try: return open(M+"\\"+p.replace("/","\\"),"rb").read()
    except Exception: return None
def integ(p):
    r=subprocess.run(["git","show","HEAD:"+p],capture_output=True)
    return r.stdout if r.returncode==0 else None
paths=["web/src/pages/canvas/project.tsx","web/src/pages/create/index.tsx","web/src/components/canvas/canvas-assistant-panel.tsx",
"web/src/pages/canvas/use-canvas-assistant-visibility.ts","web/src/components/canvas/canvas-cloud-agent-panel.tsx",
"web/src/components/canvas/canvas-local-agent-panel.tsx","web/src/pages/canvas/canvas-assistant-panel-column.tsx",
"web/src/stores/use-config-store.ts","web/src/services/skill-runtime.ts","web/src/services/user-data-sync.ts",
"backend/internal/app/finance.go","backend/internal/database/migrations.go","web/src/router.tsx","web/test/canvas-angle-dialog.test.ts"]
for p in paths:
    a=main(p); b=integ(p)
    same = (a is not None and b is not None and a.replace(b"\r\n",b"\n")==b.replace(b"\r\n",b"\n"))
    print(("SAME " if same else "DIFF "), (len(a) if a else "-"), (len(b) if b else "-"), p)
