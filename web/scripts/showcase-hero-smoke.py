"""Production hero layout check with Edge; no generation or login writes."""
import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

base = sys.argv[1]
out = Path(__file__).resolve().parents[2] / ".local/cache/showcase-20260922"
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(reduced_motion="reduce")
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base, wait_until="domcontentloaded")
    page.locator(".yx-entry-headline").wait_for()
    assert page.locator(".yx-entry-headline").inner_text() == "Your Vision.\nBrought to Life."
    assert not page.locator('script[src*="/@vite/client"]').count()
    for width, height in [(1912, 948), (1440, 1000), (1366, 768), (390, 844), (390, 667), (844, 390)]:
        page.set_viewport_size({"width": width, "height": height})
        page.wait_for_timeout(150)
        headline = page.locator(".yx-entry-headline").bounding_box()
        form = page.locator(".yx-entry-form").bounding_box()
        gallery = page.locator(".yx-home-showcase").bounding_box()
        options = page.locator(".yx-entry-options").bounding_box()
        assert headline["y"] >= 0, (width, height, headline)
        assert headline["y"] + headline["height"] <= form["y"]
        assert options["y"] + options["height"] <= gallery["y"], (width, height, options, gallery)
        assert gallery["y"] + gallery["height"] <= height + 1
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.screenshot(path=str(out / f"hero-{width}x{height}.png"))
    assert not errors, errors
    result = {"passed": True, "base": base, "viewports": 6, "pageErrors": errors}
    (out / "hero-receipt.json").write_text(json.dumps(result))
    print(json.dumps(result))
    browser.close()
