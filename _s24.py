W=open("web/src/pages/canvas/project.tsx",encoding="utf-8").read().replace("\r\n","\n").split("\n")
def d(a,b,t=""):
    print("---",t)
    for i in range(a-1,b): print(i+1, repr(W[i][:150]))
d(555,600,"cancel/session effect")
