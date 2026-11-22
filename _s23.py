import re
W=open("web/src/pages/canvas/project.tsx",encoding="utf-8").read().replace("\r\n","\n")
body="\n".join(W.split("\n")[160:])
for sym in ["AssistantPanelColumn","getPanelWidthBounds","CanvasAssistantPanel","shouldAutoConnectCanvasRuntime","readLocalRuntimeBootstrapState","canvasResourceMentionToken","applyCanvasConnectionPromptSync","reorderCanvasResourceConnections","replaceCanvasReferenceMentions","getContextResourceNodes","buildCanvasNodeMentionReferenceMap","normalizeCanvasNodeMentionTokens","writeCanvasNodePrompt","buildCanvasResourceReferences","buildCanvasAgentMentionReferences"]:
    print("%-40s %d"%(sym, body.count(sym)))
print("=== how are they imported now ===")
for l in W.split("\n")[:160]:
    if "canvas-resource-references" in l or "canvas-assistant-panel" in l or "local-runtime" in l or "canvas-node-prompt" in l or "canvas-project-feedback" in l:
        print("  ",l[:160])
