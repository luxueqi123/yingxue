ls=open("web/src/pages/canvas/project.tsx",encoding="utf-8").read().replace("\r\n","\n").split("\n")
for i,l in enumerate(ls):
    if "AssistantPanelColumn" in l or "getPanelWidthBounds" in l or "canvas-assistant-panel" in l:
        print(i+1, repr(l[:160]))
print("---- imports 55-115")
for i in range(54,116): print(" ",i+1,ls[i][:140])
