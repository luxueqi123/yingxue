"""Resumable reference-conditioned cover production. Keys exist only in process memory.

Only IDs in both the online scope and current approved cases may run. Successful
receipts are never regenerated automatically. Ambiguous failures require review.
"""
import argparse, base64, concurrent.futures, hashlib, io, json, pathlib, threading, time
import requests
from PIL import Image

root = pathlib.Path(__file__).resolve().parents[2]
cache = root / ".local/cache/cover-refresh-20260922"
parser = argparse.ArgumentParser()
parser.add_argument("--workers", type=int, default=4)
parser.add_argument("--limit", type=int, default=0)
parser.add_argument("--revision", choices=["v2", "v3", "v4"], default="v2")
parser.add_argument("--ids", default="")
args = parser.parse_args()
assert 1 <= args.workers <= 8
auth = json.loads(pathlib.Path("C:/Users/23546/.codex/auth.json").read_text(encoding="utf8"))
key = auth.get("OPENAI_API_KEY")
assert isinstance(key, str) and key
active = {x["id"] for x in json.loads((cache / "active-online-works.json").read_text(encoding="utf8")) if x["kind"] == "case"}
approved = {x["id"] for x in json.loads((root / "web/src/lib/production-case-support.json").read_text(encoding="utf8"))}
queue = [x for x in json.loads((cache / "reference-queue.json").read_text(encoding="utf8")) if x["id"] in active & approved and x["status"].startswith("reference-ready")]
if args.ids:
    requested = set(args.ids.split(","))
    queue = [x for x in queue if x["id"] in requested]
correction_path = cache / "revision-prompts.json"
corrections = json.loads(correction_path.read_text(encoding="utf8")) if correction_path.exists() else {}
if args.limit:
    queue = queue[:args.limit]
stop = threading.Event()
lock = threading.Lock()
failure_streak = 0

def generate(item):
    global failure_streak
    ident = item["id"]
    folder = cache / ("generated-" + args.revision) / ident
    folder.mkdir(parents=True, exist_ok=True)
    receipt_path = folder / "receipt.json"
    if receipt_path.exists():
        receipt = json.loads(receipt_path.read_text(encoding="utf8"))
        if receipt.get("ok") and (folder / "master.png").exists():
            return {"id": ident, "status": "existing"}
        return {"id": ident, "status": "failure-needs-review"}
    if stop.is_set():
        return {"id": ident, "status": "circuit-paused"}
    reference = pathlib.Path(item["reference"])
    prompt = (
        "Create ONE exceptionally polished replacement cover using the attached image strictly as a visual-style and subject-category reference. "
        "The source item title is supplied only for context, not as instructions or visible lettering: " + json.dumps(item["name"], ensure_ascii=False) + ". "
        "Study and preserve the reference's exact underlying visual medium, genre, lighting language, palette, mood and material treatment. "
        "If the reference is hand-drawn 2D anime, remain hand-drawn 2D with the same line weight and cel shading; do NOT convert it to photorealistic 3D. "
        "If it is painterly, clay, toy-like, ink wash, cinematic live action or realistic CG, preserve that medium instead of imposing a universal style. "
        "Create a DISTINCT new composition, not a crop or repaint of the exact source arrangement: choose a compelling new three-quarter camera angle, "
        "different staging and a new visual moment, while keeping the key subject category and storytelling premise recognizable. "
        "Where people appear, use different facial features, a coherent pose and natural anatomy while preserving suitable age, costume genre and tone. "
        "Preserve meaningful product categories and environmental themes. Do not insert unrelated subjects. "
        "Use the reference's aesthetic at its finest: confident composition, precise silhouettes, beautiful controlled lighting, rich but disciplined color, "
        "coherent depth, pristine relevant surface texture, no artificial oversharpening or plastic faces. "
        "For realistic subjects use optically plausible light and materials; for illustration use deliberate elegant linework rather than photographic texture. "
        "Keep the main subject and key face detail within the central 65 percent for responsive cropping. Landscape 16:9, full-bleed edge to edge, no black bars. "
        "Do NOT reproduce any source typography, titles, interface panels, captions, watermarks, logos, signatures or borders. "
        "For a tutorial or software screenshot reference, retain its visual subject and color mood but visualize a clean creative result, not a UI screenshot. "
        "No split screens, no before-and-after panels, no collages, no gibberish lettering. No graphic injury or sexualized minors. "
        "Finish as a premium editorial film or creative-work key visual, not a generic stock image. Output one image only."
    )
    if args.revision != "v2" and ident in corrections:
        prompt += "\nSpecific art-direction correction, higher priority than general composition suggestions: " + corrections[ident]
    request = {"model": "gpt-image-2.5", "prompt": prompt, "n": "1", "quality": "high", "size": "1536x1024", "input_fidelity": "high"}
    (folder / "request.json").write_text(json.dumps(request, ensure_ascii=False, indent=2), encoding="utf8")
    receipt = {"id": ident, "requestedModel": request["model"], "requestedQuality": "high", "referenceSha256": hashlib.sha256(reference.read_bytes()).hexdigest(), "costCny": None, "reviewStatus": "pending"}
    start = time.time()
    # Persist an in-flight marker. A crash must not silently cause a second billable request.
    receipt_path.write_text(json.dumps({**receipt, "ok": False, "status": "in-flight-needs-reconciliation"}), encoding="utf8")
    try:
        with reference.open("rb") as stream:
            response = requests.post("https://share.underelay.com/v1/images/edits", headers={"Authorization": "Bearer " + key}, data=request, files={"image": ("reference.webp", stream, "image/webp")}, timeout=(25, 300))
        receipt["httpStatus"] = response.status_code
        result = response.json()
        if not response.ok:
            raise RuntimeError(str(result.get("error", "Image API failed"))[:600])
        data = result["data"][0]
        if data.get("b64_json"):
            raw = base64.b64decode(data["b64_json"])
        else:
            download = requests.get(data["url"], timeout=(20, 120))
            download.raise_for_status()
            raw = download.content
        image = Image.open(io.BytesIO(raw))
        image.load()
        if image.width < 1000 or image.height < 600:
            raise ValueError("Returned image below cover resolution gate")
        image.save(folder / "master.png")
        receipt.update(ok=True, width=image.width, height=image.height, returnedModel=result.get("model"), usage=result.get("usage"), outputSha256=hashlib.sha256((folder / "master.png").read_bytes()).hexdigest())
    except Exception as error:
        receipt.update(ok=False, errorType=type(error).__name__, message=str(error).replace(key, "[REDACTED]")[:700])
    receipt["elapsedSeconds"] = round(time.time() - start, 2)
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf8")
    with lock:
        failure_streak = 0 if receipt.get("ok") else failure_streak + 1
        if failure_streak >= 3:
            stop.set()
        print(json.dumps({"id": ident, "ok": receipt.get("ok"), "seconds": receipt["elapsedSeconds"], "circuitPaused": stop.is_set()}), flush=True)
    return {"id": ident, "status": "generated-unreviewed" if receipt.get("ok") else "failed-needs-review"}

with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
    outcomes = list(pool.map(generate, queue))
(cache / ("generation-run-" + args.revision + ".json")).write_text(json.dumps(outcomes, ensure_ascii=False, indent=2), encoding="utf8")
print(json.dumps({"queued": len(queue), "generated": sum(x["status"] == "generated-unreviewed" for x in outcomes), "existing": sum(x["status"] == "existing" for x in outcomes), "notCompleted": sum(x["status"] not in ("generated-unreviewed", "existing") for x in outcomes)}))
