"""Read-only production carousel check. No login or generation requests."""
import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip("/")
media = json.loads((Path(__file__).resolve().parents[1] / "src/lib/entry-showcase-media.json").read_text())
out = Path(__file__).resolve().parents[2] / ".local/cache/showcase-20260922"
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    page.set_default_timeout(90000)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.clock.install()
    page.goto(base, wait_until="domcontentloaded", timeout=90000)
    cards = page.locator(".yx-showcase-card")
    cards.first.wait_for()
    page.wait_for_function("Array.from(document.querySelectorAll('.yx-showcase-card img')).every(i => i.complete && i.naturalWidth > 0)")
    assert cards.count() == 3
    assert "作品展示" not in page.locator("body").inner_text()
    assert "本地原片" not in page.locator("body").inner_text()
    assert not page.locator('script[src*="/@vite/client"]').count()
    ids = lambda: cards.evaluate_all("els => els.map(e => e.dataset.workId)")
    first = ids()
    page.clock.run_for(12100)
    assert all(a != b for a, b in zip(first, ids()))
    second = ids()
    cards.first.hover()
    page.clock.run_for(13000)
    assert ids() == second
    page.mouse.move(0, 0)
    assert page.locator(".yx-showcase-controls, .yx-showcase-title, .yx-showcase-lane-label").count() == 0
    assert "LTV" not in page.locator("body").inner_text()
    for batch in range(3):
        page.wait_for_function("Array.from(document.querySelectorAll('.yx-showcase-card img')).every(i => i.complete && i.naturalWidth > 0)")
        for lane in range(3):
            work_id = ids()[lane]
            cards.nth(lane).click()
            video = page.locator(".yx-entry-player video")
            video.wait_for()
            src = video.get_attribute("src")
            assert src == media[work_id]
            if base.startswith("https:") or "--media" in sys.argv:
                video.evaluate("el => el.load()")
                page.wait_for_function("document.querySelector('.yx-entry-player video').readyState >= 1", timeout=60000)
                assert video.evaluate("el => el.videoWidth > 0 && el.duration > 0")
                video.evaluate("el => { el.muted = true; return el.play(); }")
                page.wait_for_function("document.querySelector('.yx-entry-player video').currentTime > 0.1", timeout=60000)
                video.evaluate("el => el.pause()")
            before = ids()
            page.clock.run_for(13000)
            assert before == ids()
            page.keyboard.press("Escape")
            page.locator(".yx-entry-player").wait_for(state="hidden")
        page.mouse.move(0, 0)
        page.evaluate("document.activeElement?.blur()")
        page.clock.run_for(12100)
    page.mouse.move(0, 0)
    page.clock.run_for(800)
    page.screenshot(path=str(out / ("public-desktop.png" if base.startswith("https:") else "desktop.png")))
    page.emulate_media(reduced_motion="reduce")
    # Media-query change delivery is asynchronous; let React clear the old timer
    # before advancing the virtual clock by multiple carousel intervals.
    page.wait_for_timeout(250)
    page.evaluate("document.activeElement?.blur()")
    before = ids()
    page.clock.run_for(25000)
    assert before == ids()
    page.set_viewport_size({"width": 390, "height": 844})
    page.screenshot(path=str(out / "mobile.png"))
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    assert cards.last.bounding_box()["y"] + cards.last.bounding_box()["height"] <= 844
    assert not errors, errors
    result = {"passed": True, "base": base, "works": 9, "interval": 12000, "errors": errors, "videoMetadataChecked": base.startswith("https:") or "--media" in sys.argv}
    (out / ("public-receipt.json" if base.startswith("https:") else "receipt.json")).write_text(json.dumps(result))
    print(json.dumps(result))
    browser.close()
