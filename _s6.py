import re
s=open("web/src/components/canvas/canvas-cloud-agent-panel.tsx",encoding="utf-8").read().replace("\r\n","\n")
ls=s.split("\n")
for i,l in enumerate(ls):
    if re.search(r"canvas-agent-(panel|shell|launcher|root)|fixed |absolute ", l):
        print(i+1, l.strip()[:170])
