import json
rows=[json.loads(l) for l in open("_fix_verify.json",encoding="utf-8",errors="replace") if l.strip()]
fails={}; runs=0; passes=0
for r in rows:
    if r.get("Action")=="fail" and r.get("Test"): fails.setdefault(r["Test"],[]).append((r.get("Package",""),r.get("Elapsed")))
    if r.get("Action")=="pass" and r.get("Test"): passes+=1
print("pass events:",passes)
print("fail tests:",len(fails))
for k,v in fails.items(): print("   FAIL",k,v)
want=["TestNewAPIVideoGenerationsParsesNestedVideoResults","TestArkSearchContracts","TestAutoDLPluginArtifact","TestOfficialProtocolPackagesAreSelfContainedDeclarativePlugins","TestProductionSkillsSeedAndUserState"]
done={r["Test"] for r in rows if r.get("Action") in ("pass","fail") and r.get("Test")}
for w in want: print("%-64s %s"%(w, "pass" if (w in done and w not in fails) else ("FAIL" if w in fails else "not run")))
