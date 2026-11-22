"""Read-only source audit and versioned frame candidates; never replaces published covers."""
import collections, hashlib, json, pathlib, subprocess
from PIL import Image, ImageDraw

root = pathlib.Path(__file__).resolve().parents[2]
out = root / ".local/cache/cover-refresh-20260922"
out.mkdir(parents=True, exist_ok=True)
cache = root / ".local/cache/showcase-20260922"
catalog = json.loads((cache / "published-catalog.json").read_text(encoding="utf8"))
approved = {x["id"] for x in json.loads((root / "web/src/lib/production-case-support.json").read_text(encoding="utf8"))}
support = {x["id"] for x in json.loads((root / "web/src/lib/production-chain-support.json").read_text(encoding="utf8"))} | {"pl-aa008befea38a466fa648c706cf8f337"}
text = (root / "web/src/lib/published-production-assets.ts").read_text(encoding="utf8")
published = json.loads(text[text.index("= {")+2:text.rindex("}")+1])
manifest = {x["id"]: x for x in json.loads((cache / "case-media-manifest.json").read_text())["entries"]}
source = pathlib.Path("E:/桌面文件/映雪创作平台二开资产/二开首要资产/全量LTV/06_案例素材/final_outputs")
by_size = collections.defaultdict(list)
for path in source.glob("*.mp4"):
    by_size[path.stat().st_size].append(path)
inventory = []
for item in catalog["items"]:
    ident = item["id"]
    visible = ident in approved or ident in published and ident in support
    original = published.get(ident, {}).get("cover") or item.get("localCover") or item.get("cover")
    inventory.append({"id": ident, "name": item["name"], "kind": item["kind"], "visible": visible, "originalCover": original, "hasLocalVideo": ident in manifest, "status": "pending"})
(out / "inventory.json").write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding="utf8")
ffmpeg = next(pathlib.Path("C:/Users/23546/AppData/Local/Microsoft/WinGet/Packages").glob("Gyan.FFmpeg_*/ffmpeg*/bin/ffmpeg.exe"))
generated = []
for item in inventory:
    if not item["visible"] or item["id"] not in manifest:
        continue
    entry = manifest[item["id"]]
    info = entry["localMediaInfo"]
    paths = by_size[info["bytes"]]
    matched = next((path for path in paths if hashlib.file_digest(path.open("rb"), "sha256").hexdigest() == info["sha256"]), None)
    if not matched:
        continue
    folder = out / item["id"]
    folder.mkdir(exist_ok=True)
    frames = []
    for index, fraction in enumerate([.22, .42, .62, .78]):
        seconds = round(info["durationSeconds"] * fraction, 3)
        dest = folder / f"frame-{index}.webp"
        if not dest.exists():
            subprocess.run([str(ffmpeg), "-hide_banner", "-loglevel", "error", "-ss", str(seconds), "-i", str(matched), "-frames:v", "1", "-vf", "scale=1280:-2", "-quality", "88", str(dest)], check=True, timeout=60)
        frames.append({"path": str(dest), "seconds": seconds})
    sheet = Image.new("RGB", (1280, 400), "#111820")
    draw = ImageDraw.Draw(sheet)
    for index, frame in enumerate(frames):
        im = Image.open(frame["path"]).convert("RGB")
        im.thumbnail((320, 340))
        sheet.paste(im, (index*320+(320-im.width)//2, 30+(340-im.height)//2))
        draw.text((index*320+10, 8), f"{index} / {frame['seconds']}s", fill="white")
    sheet.save(folder / "contact.jpg")
    generated.append({**item, "sourceSha256": info["sha256"], "frames": frames})
    print(item["id"], "candidates ready", flush=True)
(out / "candidates.json").write_text(json.dumps(generated, ensure_ascii=False, indent=2), encoding="utf8")
print(json.dumps({"catalog": len(inventory), "visible": sum(x["visible"] for x in inventory), "candidateItems": len(generated), "generatedPaidImages": 0}))
