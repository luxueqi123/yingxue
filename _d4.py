import subprocess, io, difflib
files=["web/src/components/canvas/canvas-agent-chat-ui.tsx","web/src/components/canvas/canvas-assistant-online-tools.ts","web/src/components/canvas/canvas-assistant-panel.tsx","web/src/components/conversation/README.md"]
for p in files:
    h=subprocess.run(["git","show","98822b65:"+p],capture_output=True).stdout.decode("utf-8").replace("\r\n","\n").split("\n")
    d=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n").split("\n")
    print("="*80); print(p)
    for ln in difflib.unified_diff(h,d,lineterm="",n=0):
        if ln.startswith(("+++","---","@@")): print(ln[:140])
        elif ln[:1] in "+-": print("  ",ln[:150])
