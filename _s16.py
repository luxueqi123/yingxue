ls=open("web/src/pages/canvas/project.tsx",encoding="utf-8").read().replace("\r\n","\n").split("\n")
def d(a,b):
    for i in range(a-1,b):
        l=ls[i]; print(i+1, len(l)-len(l.lstrip()), repr(l.strip()[:100]))
d(2800,2835)
