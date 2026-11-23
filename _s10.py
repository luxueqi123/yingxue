w=open("web/src/pages/canvas/project.tsx",encoding="utf-8").read().replace("\r\n","\n").split("\n")
print("WORK total",len(w))
for i,l in enumerate(w):
    if "angleNode?.metadata?.content" in l or "emotionNode?.metadata?.content" in l or "lightingNode?.metadata?.content" in l:
        print(" ",i+1,l.strip()[:120])
print("--- work 2910-2945")
for i in range(2909,2945): print("  ",i+1,w[i].strip()[:110])
