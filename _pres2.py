import subprocess
paths=["web/src/services/api/agent.ts","web/src/services/agent-canvas-sync.ts","web/src/services/skill-runtime.ts",
"web/src/lib/canvas/cloud-agent-plan.ts","web/src/components/canvas/canvas-cloud-agent-chat-ui.tsx",
"web/src/components/canvas/use-agent-panel-layout.ts","web/src/components/canvas/canvas-local-agent-panel.tsx",
"web/src/lib/canvas/agent-debug-export.ts","web/src/components/canvas/canvas-agent-chat-ui.tsx",
"backend/internal/handler/agent.go"]
for p in paths:
    row=[]
    for ref in ["01a2d171","HEAD","MERGE_HEAD"]:
        r=subprocess.run(["git","cat-file","-e",f"{ref}:{p}"],capture_output=True)
        row.append("y" if r.returncode==0 else "n")
    print("base=%s HEAD=%s ORIG=%s"%tuple(row),p)
