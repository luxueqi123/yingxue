import re
ls=open("web/src/pages/canvas/project.tsx",encoding="utf-8").read().replace("\r\n","\n").split("\n")
tags=["div","section","main","CanvasOverlayLayerProvider","AssistantPanelColumn","InfiniteCanvas","CanvasNodeActionContext.Provider","CanvasNodeGraphContext.Provider"]
stack=[]
def tagre(t):
    return re.compile(r"</?"+re.escape(t)+r"[\s/>]")
for i in range(2420, 3000):
    l=ls[i]
    for t in tags:
        for m in re.finditer(r"<(/?)"+re.escape(t)+r"(?=[\s/>])", l):
            if m.group(1):
                if stack and stack[-1][0]==t: stack.pop()
                else: print("MISMATCH close",t,"at",i+1,"stack top",stack[-1] if stack else None)
            else:
                # self-closing?
                rest=l[m.end():]
                sc = rest.lstrip().startswith("/>") or re.match(r"^[^>]*/>", rest)
                if not sc: stack.append((t,i+1))
    if i in (2579,2653,2654,2765,2878,2880,2885,2886,2887,2888,2889):
        print(i+1, "stack:", [s[0]+"@"+str(s[1]) for s in stack])
print("FINAL", [s[0]+"@"+str(s[1]) for s in stack])
