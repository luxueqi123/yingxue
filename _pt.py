import json
rows=[json.loads(l) for l in open("_pkg_test.json",encoding="utf-8",errors="replace") if l.strip()]
fails={}; 
for r in rows:
    if r.get("Action")=="fail" and r.get("Test"): fails.setdefault(r["Test"],r.get("Package",""))
print("protocol+skills 包：fail 测试数 =",len(fails))
for k,v in fails.items(): print("   ",k,v)
print("总 pass 事件:",sum(1 for r in rows if r.get("Action")=="pass" and r.get("Test")))
