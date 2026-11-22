"""Build numbered original/new comparison sheets; never auto-approve images."""
import argparse, json, pathlib
from PIL import Image, ImageDraw, ImageFont

root = pathlib.Path(__file__).resolve().parents[2]
cache = root / ".local/cache/cover-refresh-20260922"
queue = json.loads((cache / "reference-queue.json").read_text(encoding="utf8"))
parser = argparse.ArgumentParser()
parser.add_argument("--revision", choices=["v2", "v3", "v4"], default="v2")
args = parser.parse_args()
out = cache / ("review-sheets" if args.revision == "v2" else "review-sheets-" + args.revision)
out.mkdir(exist_ok=True)
font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 14)
index = []
for number, item in enumerate(queue):
    folder = cache / ("generated-" + args.revision) / item["id"]
    if not (folder / "master.png").exists():
        continue
    receipt = json.loads((folder / "receipt.json").read_text(encoding="utf8"))
    if receipt.get("ok"):
        index.append({**item, "number": number, "master": str(folder / "master.png")})
for start in range(0, len(queue), 12):
    batch = [x for x in index if start <= x["number"] < start + 12]
    if not batch:
        continue
    target = out / f"sheet-{start:03d}.jpg"
    if target.exists() and target.stat().st_mtime >= max(pathlib.Path(x["master"]).stat().st_mtime for x in batch):
        continue
    canvas = Image.new("RGB", (1680, 1120), "#131820")
    draw = ImageDraw.Draw(canvas)
    for item in batch:
        position = item["number"] - start
        x, y = (position % 3) * 560, (position // 3) * 280
        draw.text((x + 6, y + 4), f'{item["number"]} {item["id"][5:13]} {item["name"][:22]}', font=font, fill="white")
        for path, width, left in [(item["reference"], 130, x + 4), (item["master"], 410, x + 144)]:
            image = Image.open(path).convert("RGB")
            image.thumbnail((width, 240))
            canvas.paste(image, (left, y + 32 + (240-image.height)//2))
    canvas.save(target, quality=95)
(out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf8")
print(json.dumps({"generatedAvailableForReview": len(index), "totalScope": len(queue)}))
