"""Publish only manually reviewed frame choices to a new, versioned asset directory."""
import hashlib, json, pathlib, shutil

root = pathlib.Path(__file__).resolve().parents[2]
cache = root / ".local/cache/cover-refresh-20260922"
items = json.loads((cache / "candidates.json").read_text(encoding="utf8"))
# Indices refer to the reviewed contact sheets, not an automatic quality score.
choices = {0: 2, 1: 0, 2: 2, 3: 2, 4: 2, 5: 3, 6: 1, 7: 3, 8: 0, 9: 3, 10: 1, 11: 2, 12: 0, 13: 2, 14: 0, 15: 1, 16: 1, 17: 2, 18: 3, 19: 1, 20: 1, 21: 0, 23: 1, 24: 1}
folder = root / "web/public/production-library/yingxue-covers/v1"
folder.mkdir(parents=True, exist_ok=True)
backup = cache / "originals"
backup.mkdir(exist_ok=True)
mapping, receipts = {}, []
for index, frame in choices.items():
    item = items[index]
    ident = item["id"]
    original = root / "web/public/production-library/covers/cases" / (ident[5:] + ".webp")
    assert original.exists(), ident
    shutil.copy2(original, backup / original.name)
    candidate = pathlib.Path(item["frames"][frame]["path"])
    old_hash = hashlib.sha256(original.read_bytes()).hexdigest()
    new_hash = hashlib.sha256(candidate.read_bytes()).hexdigest()
    assert old_hash != new_hash
    dest = folder / (ident + ".webp")
    shutil.copy2(candidate, dest)
    mapping[ident] = "/production-library/yingxue-covers/v1/" + dest.name
    receipts.append({"id": ident, "name": item["name"], "method": "reviewed-original-video-frame", "sourceVideoSha256": item["sourceSha256"], "seconds": item["frames"][frame]["seconds"], "originalSha256": old_hash, "newSha256": new_hash, "cover": mapping[ident]})
(root / "web/src/lib/yingxue-cover-overrides.json").write_text(json.dumps(mapping, indent=2)+"\n", encoding="utf8")
(cache / "approved.json").write_text(json.dumps(receipts, ensure_ascii=False, indent=2), encoding="utf8")
inventory = json.loads((cache / "inventory.json").read_text(encoding="utf8"))
for item in inventory:
    if item["id"] in mapping:
        item.update(status="prepared-not-deployed", replacement=mapping[item["id"]])
(cache / "inventory.json").write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding="utf8")
print(json.dumps({"prepared": len(mapping), "paidImages": 0, "paidCostCny": 0}))
