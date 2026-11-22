import re
p="web/src/pages/canvas/project.tsx"
s=open(p,encoding="utf-8").read().replace("\r\n","\n")
ls=s.split("\n")
print("total",len(ls))
for i,l in enumerate(ls):
    if re.search(r"useCanvasAssistantVisibility|openAssistant|const openAgent|codexAutoConnect|codexCompactAgent|AssistantPanelColumn|CanvasAssistantPanel|CanvasCloudAgentPanel|CanvasLocalAgentPanel|useCanvasAgentStore|agentMentionReferences|sendSelectionToAgent|import \{ CanvasFocusModeBar", l):
        print(" ",i+1,l.strip()[:150])
