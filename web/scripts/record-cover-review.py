"""Record explicit human/assistant visual decisions; no automatic approval."""
import argparse, hashlib, json, pathlib

root = pathlib.Path(__file__).resolve().parents[2]
cache = root / ".local/cache/cover-refresh-20260922"
parser = argparse.ArgumentParser()
parser.add_argument("--numbers", required=True)
parser.add_argument("--revision", choices=["v2", "v3", "v4"], default="v2")
parser.add_argument("--verdict", choices=["approved", "rejected"], required=True)
parser.add_argument("--note", required=True)
args = parser.parse_args()
queue = json.loads((cache / "reference-queue.json").read_text(encoding="utf8"))
path = cache / "review-decisions.json"
decisions = json.loads(path.read_text(encoding="utf8")) if path.exists() else {}
numbers = []
for part in args.numbers.split(","):
    if "-" in part:
        first, last = map(int, part.split("-"))
        numbers.extend(range(first, last + 1))
    else:
        numbers.append(int(part))
for number in numbers:
    item = queue[number]
    folder = cache / ("generated-" + args.revision) / item["id"]
    receipt = json.loads((folder / "receipt.json").read_text(encoding="utf8"))
    assert receipt.get("ok")
    sha = hashlib.sha256((folder / "master.png").read_bytes()).hexdigest()
    decisions[item["id"]] = {"number": number, "revision": args.revision, "verdict": args.verdict, "note": args.note, "outputSha256": sha}
path.write_text(json.dumps(decisions, ensure_ascii=False, indent=2), encoding="utf8")
print(json.dumps({"recorded": len(numbers), "approvedTotal": sum(x["verdict"] == "approved" for x in decisions.values())}))
