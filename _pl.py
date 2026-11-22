import json,subprocess,difflib
rows=json.load(open("_updiff2.json",encoding="utf-8"))
pure=[r for r in rows if r["up_only"]>0 and not r["xue_touched"]]
pure.sort(key=lambda r:-r["up_only"])
print("=== 23 个『映雪未改、底座被丢』文件 ===")
for r in pure:
    print("  %-70s 丢%3d 行 (上游新增%3d/上游删%3d)"%(r["path"][:70],r["up_only"],r["up_added"],r["up_deleted"]))
json.dump(pure,open("_purelist.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
