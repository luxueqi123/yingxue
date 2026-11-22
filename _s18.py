import re,os
pats=["codexAutoConnect","codexCompactAgent","readLocalRuntimeBootstrapState","shouldAutoConnectCanvasRuntime","CanvasLocalAgentPanel","compactAgentStatus","AgentLocalRuntime","canvas-local-runtime"]
for root in ["web/test","web/src","backend"]:
    for dp,dn,fn in os.walk(root):
        if "node_modules" in dp: continue
        for f in fn:
            if not f.endswith((".ts",".tsx",".go",".mjs")): continue
            p=os.path.join(dp,f)
            try: s=open(p,encoding="utf-8",errors="replace").read()
            except: continue
            for pat in pats:
                if pat in s:
                    print(pat, "->", p, "x", s.count(pat))
