import re
p="web/src/components/canvas/canvas-assistant-online-tools.ts"
s=open(p,encoding="utf-8").read()
i=s.find("backendAgentProviderConfig")
print(s[i-200:i+900])
