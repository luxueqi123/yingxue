# -*- coding: utf-8 -*-
import os
REPO = r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912"
p = os.path.join(REPO, "backend/internal/app/provider_protocol.go")
raw = open(p,"rb").read(); crlf = b"\r\n" in raw
lines = raw.decode("utf-8").replace("\r\n","\n").split("\n")
s = [i for i,l in enumerate(lines) if l.startswith("<<<<<<< ")][0]
e = [i for i,l in enumerate(lines) if l.startswith(">>>>>>> ")][0]
mid = [i for i in range(s,e) if lines[i].startswith("=======")][0]
ours = lines[s+1:mid]
lines[s:e+1] = ours
t = "\n".join(lines); d = t.encode("utf-8")
if crlf: d=d.replace(b"\r\n",b"\n").replace(b"\n",b"\r\n")
open(p+".tmpmerge","wb").write(d); os.replace(p+".tmpmerge",p)
print("OK provider_protocol.go kept ours", len(ours), "lines; first:", ours[0].strip(), "| last:", ours[-1].strip())
