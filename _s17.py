import re
p="web/src/pages/canvas/project.tsx"
s=open(p,encoding="utf-8").read().replace("\r\n","\n")
for pat in ["openAssistant","openAssistantAgent","import { useCanvasAgentStore","CanvasLocalAgentPanel","localAgentConnected","compactAgentStatus","agentPrefillPrompt","setAgentPrefillPrompt","useLayoutEffect","shouldAutoConnectCanvasRuntime","readLocalRuntimeBootstrapState","buildCanvasAgentMentionReferences"]:
    hits=[i+1 for i,l in enumerate(s.split("\n")) if pat in l]
    print(pat, hits)
print("---- imports around 130-145")
ls=s.split("\n")
for i in range(126,150): print(" ",i+1,ls[i][:150])
