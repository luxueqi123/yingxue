import json,io
def load(p):
    out=[]
    for line in io.open(p,encoding="utf-8",errors="replace"):
        line=line.strip()
        if not line: continue
        try: out.append(json.loads(line))
        except Exception: pass
    return out
b=load("_go_cgo_baseline.json"); g=load("_go_cgo_integration.json")
print("baseline events",len(b),"integration events",len(g))
def fails(ev):
    r={}
    for e in ev:
        if e.get("Action")=="fail" and e.get("Test"):
            r.setdefault(e["Test"],e.get("Package",""))
    return r
fb,fg=fails(b),fails(g)
print("baseline failing tests",len(fb))
for k,v in sorted(fb.items()): print("   ",k)
print("seed test in baseline fails:", "TestProductionSkillsSeedAndUserState" in fb)
print("seed test in integration fails:", "TestProductionSkillsSeedAndUserState" in fg)
