"""Verify public bytes and homepage poster mapping without login or writes."""
import hashlib, io, json, pathlib, sys
import requests
from PIL import Image
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parents[2]
base = sys.argv[1].rstrip("/")
cache = root / ".local/cache/cover-refresh-20260922"
approved = json.loads((cache / "approved.json").read_text(encoding="utf8"))
for item in approved:
    response = requests.get(base + item["cover"], timeout=30)
    response.raise_for_status()
    assert hashlib.sha256(response.content).hexdigest() == item["newSha256"], item["id"]
    image = Image.open(io.BytesIO(response.content))
    image.verify()
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    page.clock.install()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base, wait_until="domcontentloaded")
    page.locator(".yx-showcase-card").first.wait_for()
    changed = set()
    for batch in range(3):
        page.wait_for_function("Array.from(document.querySelectorAll('.yx-showcase-card img')).every(i=>i.complete&&i.naturalWidth>0)")
        for card in page.locator(".yx-showcase-card").all():
            ident = card.get_attribute("data-work-id")
            if ident not in ("reel", "haier"):
                assert "/yingxue-covers/v1/case-" + ident in card.locator("img").get_attribute("src")
                changed.add(ident)
        page.clock.run_for(12100)
    assert len(changed) == 7
    page.emulate_media(reduced_motion="reduce")
    page.screenshot(path=str(cache / "public-home.png"))
    assert not errors, errors
    browser.close()
receipt = {"passed": True, "base": base, "verifiedNewCovers": len(approved), "homepageLtvCovers": 7, "pageErrors": errors}
(cache / "public-receipt.json").write_text(json.dumps(receipt))
print(json.dumps(receipt))
