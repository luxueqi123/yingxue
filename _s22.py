import re
W=open("web/src/pages/canvas/project.tsx",encoding="utf-8").read().replace("\r\n","\n")
body="\n".join(W.split("\n")[160:])
for sym in ["AssistantPanelColumn","getPanelWidthBounds","CanvasAssistantPanel","CanvasLocalAgentPanel","useCanvasAgentStore","useCanvasAgentOperations","readLocalRuntimeBootstrapState","shouldAutoConnectCanvasRuntime","useThemeStore","PortraitClearanceModal","PORTRAIT_CLEARANCE_NODE_TYPE","usePortraitClearanceCoordinator","reconcilePortraitClearanceInputBindings","createDefaultPortraitClearanceState","PortraitClearanceNodeState","CanvasAgentChangeToast","applyCanvasConnectionPromptSync","getContextResourceNodes","reorderCanvasResourceConnections","replaceCanvasReferenceMentions","buildCanvasNodeMentionReferenceMap","normalizeCanvasNodeMentionTokens","writeCanvasNodePrompt","canvasResourceMentionToken","buildCanvasResourceReferences","buildCanvasAgentMentionReferences"]:
    print("%-40s %d"%(sym, body.count(sym)))
