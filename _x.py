import io
for p in ["web/src/components/canvas/canvas-agent-chat-ui.tsx","web/src/components/canvas/canvas-assistant-online-tools.ts","web/src/components/canvas/canvas-assistant-panel.tsx","web/src/components/conversation/README.md"]:
    d=io.open(p,encoding="utf-8",errors="replace").read().replace("\r\n","\n")
    print("###",p,"lines",d.count("\n")+1)
