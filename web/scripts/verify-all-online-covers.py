"""Production assets + full gallery pagination. Auth API is isolated fixture-only."""
import concurrent.futures, hashlib, io, json, pathlib, sys, threading
import httpx
from PIL import Image
from playwright.sync_api import sync_playwright, expect

root = pathlib.Path(__file__).resolve().parents[2]
cache = root / ".local/cache/cover-refresh-20260922"
base = sys.argv[1].rstrip("/")
browser_only = "--browser-only" in sys.argv[2:]
approved = json.loads((cache / "approved-release.json").read_text(encoding="utf8"))
scope = json.loads((cache / "release-scope.json").read_text(encoding="utf8"))
mapping = {x["id"]: x["cover"] for x in approved}
assert len(mapping) == scope["replaced"] and len(mapping) + len(scope["remaining"]) == 359
thread_state = threading.local()

def verify_asset(item):
    if not hasattr(thread_state, "session"):
        thread_state.session = httpx.Client(http2=True, timeout=httpx.Timeout(90, connect=15))
    for attempt in range(2):
        try:
            response = thread_state.session.get(base + item["cover"])
            break
        except httpx.TransportError:
            if attempt == 1:
                raise
            print(json.dumps({"retryReadOnlyAsset": item["id"]}), flush=True)
    response.raise_for_status()
    assert hashlib.sha256(response.content).hexdigest() == item["newSha256"], item["id"]
    image = Image.open(io.BytesIO(response.content))
    image.verify()
    return item["id"]

asset_ids = []
if not browser_only:
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for ident in pool.map(verify_asset, approved):
            asset_ids.append(ident)
            if len(asset_ids) % 50 == 0:
                print(json.dumps({"verifiedAssetHashes": len(asset_ids)}), flush=True)
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    def api(route):
        assert route.request.method in ("GET", "OPTIONS"), "Unexpected API write"
        path = route.request.url.split("/api/", 1)[1]
        data = []
        if path.startswith("auth/session"):
            data = {"user": {"id": "cover-smoke", "username": "preview", "displayName": "封面验证", "role": "user", "status": "active"}, "logicalModels": []}
        elif "catalog" in path:
            data = {"source": "system", "channels": [], "models": [], "logicalModels": []}
        elif "user-data" in path:
            data = {"items": []}
        elif any(word in path for word in ["settings", "appearance", "wallet"]):
            data = {}
        route.fulfill(json={"code": 0, "data": data, "msg": ""})
    page.route(base + "/api/**", api)
    if base.startswith("http://127.0.0.1"):
        manifest = json.loads((root / ".local/cache/showcase-20260922/case-media-manifest.json").read_text())
        page.route(base + "/production-library/case-media-manifest.json", lambda route: route.fulfill(json=manifest))
    page.goto(base + "/", wait_until="domcontentloaded", timeout=90000)
    page.locator(".yx-entry-headline").wait_for(timeout=60000)
    page.wait_for_timeout(1500)
    page.get_by_role("button", name="进入创作空间", exact=True).click()
    page.get_by_text("和映雪聊聊创作想法", exact=True).wait_for(timeout=60000)
    page.evaluate("window.dispatchEvent(new CustomEvent('workspace:navigate', {detail:{to:'/studio?tab=cases'}}))")
    page.get_by_text("共 359 个案例", exact=True).wait_for(timeout=60000)
    assert not page.locator('script[src*="/@vite/client"]').count()
    seen = set()
    unchanged = set()
    for number in range(15):
        images = page.locator(".inspiration-card img")
        assert images.count() > 0
        for image in images.all():
            image.scroll_into_view_if_needed()
            src = image.get_attribute("src")
            if src not in mapping.values():
                # A partial release must keep exactly the explicitly unresolved originals.
                catalog = json.loads((root / ".local/cache/showcase-20260922/published-catalog.json").read_text(encoding="utf8"))
                originals = {x["cover"] for x in catalog["items"] if x["id"] in scope["remaining"]}
                originals.update("/production-library/covers/cases/" + ident[5:] + ".webp" for ident in scope["remaining"])
                assert src in originals, src
                unchanged.add(src)
            image.evaluate("el => el.decode()")
            assert image.evaluate("el => el.naturalWidth > 0")
            seen.add(src)
        if number == 0:
            page.locator(".inspiration-gallery").scroll_into_view_if_needed()
            page.screenshot(path=str(cache / "gallery-first-page.png"))
        if number < 14:
            page.get_by_role("button", name="下一页", exact=True).click()
            expect(page.locator(".inspiration-gallery-pagination span")).to_have_text(f"{number + 2} / 15")
    assert len(seen) == 359, len(seen)
    assert len(unchanged) == len(scope["remaining"])
    page.set_viewport_size({"width": 390, "height": 844})
    page.screenshot(path=str(cache / "gallery-mobile.png"))
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    assert not errors, errors
    browser.close()
receipt = {"passed": True, "validationScope": "browser-only" if browser_only else "assets-and-browser", "completeReplacement": scope["complete"], "remaining": scope["remaining"], "base": base, "assetHashesVerified": len(asset_ids), "galleryCoversRendered": len(seen), "authApiFixtures": True, "realLoginTested": False, "pageErrors": errors}
receipt_name = "browser-public-receipt.json" if browser_only else ("all-public-receipt.json" if base.startswith("https:") else "all-local-receipt.json")
(cache / receipt_name).write_text(json.dumps(receipt))
print(json.dumps(receipt))
