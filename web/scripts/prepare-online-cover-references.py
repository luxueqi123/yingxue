"""Prepare only approved online works. No image-generation or paid requests."""
import concurrent.futures, hashlib, io, json, pathlib, re
from urllib.parse import urlparse
import requests
from PIL import Image

root = pathlib.Path(__file__).resolve().parents[2]
cache = root / ".local/cache/cover-refresh-20260922"
out = cache / "references"
out.mkdir(exist_ok=True)
catalog = {x["id"]: x for x in json.loads((root / ".local/cache/showcase-20260922/published-catalog.json").read_text(encoding="utf8"))["items"]}
active = json.loads((cache / "active-online-works.json").read_text(encoding="utf8"))
approved = {x["id"] for x in json.loads((root / "web/src/lib/production-case-support.json").read_text(encoding="utf8"))}
pending = [x for x in active if x["id"] in approved and x["kind"] == "case" and x["status"] != "deployed-public-bytes-verified"]

def prepare(item):
    ident = item["id"]
    assert re.fullmatch(r"case-[a-f0-9]{32}", ident)
    path = out / (ident + ".webp")
    result = {"id": ident, "name": item["name"], "status": "reference-unavailable", "styleReviewed": False, "generated": False}
    try:
        if not path.exists():
            url = catalog[ident].get("cover", "")
            parsed = urlparse(url)
            if parsed.scheme != "https" or not any((parsed.hostname or "").endswith(suffix) for suffix in (".liblib.art", ".liblib.cloud", ".liblibai.com")):
                raise ValueError("Unapproved source host")
            response = requests.get(url, timeout=(10, 30), stream=True, allow_redirects=False)
            response.raise_for_status()
            if 300 <= response.status_code < 400:
                raise ValueError("Redirect needs source review")
            data = bytearray()
            for chunk in response.iter_content(65536):
                data.extend(chunk)
                if len(data) > 32 * 1024 * 1024:
                    raise ValueError("Reference exceeds 32 MB")
            image = Image.open(io.BytesIO(data))
            if image.width * image.height > 80_000_000:
                raise ValueError("Reference exceeds pixel limit")
            image.load()
            image.thumbnail((2048, 2048))
            image.convert("RGB").save(path, quality=95)
        image = Image.open(path)
        image.verify()
        result.update(status="reference-ready-not-reviewed", reference=str(path), sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    except Exception as error:
        result["errorType"] = type(error).__name__
        if isinstance(error, ValueError):
            result["errorReason"] = str(error)
    return result

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(prepare, pending))
(cache / "reference-queue.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf8")
print(json.dumps({"onlinePending": len(pending), "referencesReady": sum(x["status"] == "reference-ready-not-reviewed" for x in results), "paidRequests": 0}))
