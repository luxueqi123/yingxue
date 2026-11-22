ls=open("web/src/pages/create/index.tsx",encoding="utf-8").read().replace("\r\n","\n").split("\n")
def d(a,b):
    for i in range(a-1,b): print(i+1, repr(ls[i][:170]))
d(40,90)
