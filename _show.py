import json
d=json.load(open("_upcheck.json",encoding="utf-8"))
print("=== 25 个「上游改过、但磁盘=映雪HEAD」的文件 ===")
for p in d["lost"]: print("  ",p)
print()
print("=== 索引缺失 3 个 ===")
for p in d["missing"]: print("  ",p)
