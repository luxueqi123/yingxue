import re
ls=open("web/src/pages/canvas/project.tsx",encoding="utf-8").read().replace("\r\n","\n").split("\n")
depth=0
for i in range(2394, 2915):
    l=ls[i]
    opens=len(re.findall(r"<div\b",l)); closes=len(re.findall(r"</div>",l))
    if opens or closes:
        depth += opens-closes
        if re.match(r'\s*</?div', l.strip()):
            print("%5d d=%3d %s %s"%(i+1,depth," "*max(0,depth),"<div" if opens else "</div>"))
print("final depth in range:",depth)
