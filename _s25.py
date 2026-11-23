import re
s=open(".local/cache/_restored_categorize.txt",encoding="utf-8",errors="replace").read()
for pat in ["CanvasCloudAgentPanel","CanvasAssistantPanel","assistant","project.tsx","云 Agent","云端"]:
    idxs=[m.start() for m in re.finditer(re.escape(pat),s)]
    print("==",pat,len(idxs))
    for i in idxs[:6]:
        print("   ",s[max(0,i-180):i+180].replace("\n"," | ")[:380])
