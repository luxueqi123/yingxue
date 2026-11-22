"""Materialize visually approved covers only; all online IDs must be covered."""
import argparse, hashlib, json, pathlib
from PIL import Image

root = pathlib.Path(__file__).resolve().parents[2]
cache = root / ".local/cache/cover-refresh-20260922"
parser = argparse.ArgumentParser()
parser.add_argument("--partial", action="store_true", help="Publish approved subset and explicitly record remaining IDs")
args = parser.parse_args()
decisions = json.loads((cache / "review-decisions.json").read_text(encoding="utf8"))
queue = json.loads((cache / "reference-queue.json").read_text(encoding="utf8"))
ids = {x["id"] for x in queue}
assert len(ids) == 335
remaining = sorted(ident for ident in ids if decisions.get(ident, {}).get("verdict") != "approved")
assert args.partial or not remaining, "Unreviewed or rejected cover remains"
queue = [item for item in queue if item["id"] not in remaining]
mapping_path = root / "web/src/lib/yingxue-cover-overrides.json"
mapping = json.loads(mapping_path.read_text(encoding="utf8"))
old_approved = json.loads((cache / "approved.json").read_text(encoding="utf8"))
assert len(old_approved) == 24
out = root / "web/public/production-library/yingxue-covers/v2"
out.mkdir(parents=True, exist_ok=True)
receipts = []
for item in queue:
    ident = item["id"]
    decision = decisions[ident]
    folder = cache / ("generated-" + decision["revision"]) / ident
    master = folder / "master.png"
    assert hashlib.sha256(master.read_bytes()).hexdigest() == decision["outputSha256"], ident
    receipt = json.loads((folder / "receipt.json").read_text(encoding="utf8"))
    method = receipt.get("method", "reference-conditioned-ai-cover")
    if method == "reference-image-edit":
        method = "reference-conditioned-ai-cover"
    assert receipt["ok"]
    if method == "reviewed-original-video-frame":
        assert receipt["sourceVideoSha256"] and receipt["seconds"] >= 0
    else:
        assert method == "reference-conditioned-ai-cover" and receipt["requestedQuality"] == "high"
    image = Image.open(master).convert("RGB")
    assert image.width >= 1000 and image.height >= 600
    dest = out / (ident + ".webp")
    image.save(dest, quality=95, method=6)
    cover = "/production-library/yingxue-covers/v2/" + dest.name
    mapping[ident] = cover
    entry = {"id": ident, "name": item["name"], "method": method, "revision": decision["revision"], "referenceSha256": receipt["referenceSha256"], "masterSha256": decision["outputSha256"], "newSha256": hashlib.sha256(dest.read_bytes()).hexdigest(), "cover": cover, "width": image.width, "height": image.height, "bytes": dest.stat().st_size}
    if method == "reviewed-original-video-frame":
        entry.update(sourceVideoSha256=receipt["sourceVideoSha256"], seconds=receipt["seconds"])
    receipts.append(entry)
scope = {x["id"] for x in json.loads((root / "web/src/lib/production-case-support.json").read_text(encoding="utf8"))}
assert set(mapping) == scope - set(remaining) and len(scope) == 359
mapping_path.write_text(json.dumps(mapping, ensure_ascii=False, indent=2)+"\n", encoding="utf8")
(cache / "approved-release.json").write_text(json.dumps(old_approved + receipts, ensure_ascii=False, indent=2), encoding="utf8")
(cache / "release-scope.json").write_text(json.dumps({"total": len(scope), "replaced": len(mapping), "remaining": remaining, "complete": not remaining}, indent=2), encoding="utf8")
if not remaining:
    (cache / "approved-all.json").write_text(json.dumps(old_approved + receipts, ensure_ascii=False, indent=2), encoding="utf8")
print(json.dumps({"totalMapped": len(mapping), "newGeneratedApproved": sum(x["method"] == "reference-conditioned-ai-cover" for x in receipts), "totalFrameCovers": len(old_approved) + sum(x["method"] == "reviewed-original-video-frame" for x in receipts), "webpBytes": sum(x["bytes"] for x in receipts)}))
