ls=open("web/src/pages/canvas/project.tsx",encoding="utf-8").read().replace("\r\n","\n").split("\n")
def d(a,b):
    for i in range(a-1,b):
        l=ls[i]; print(i+1, repr(l[:150]))
d(486,506)
print("---- tail")
d(3400,3420)
