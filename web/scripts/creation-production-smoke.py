"""Run against vite preview (production dist), using isolated API fixtures.

python scripts/creation-production-smoke.py http://127.0.0.1:5178
Requires Python Playwright and Microsoft Edge. Never submits generation tasks.
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5178").rstrip("/")
out = Path(__file__).resolve().parents[2] / ".local/cache/creation-production-smoke"
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text)
            if message.type == "error" and ("React error" in message.text or "caught the following error" in message.text) else None)

    def api(route):
        path = route.request.url.split("/api/", 1)[1]
        assert route.request.method in ("GET", "OPTIONS"), "Unexpected write: " + path
        data = []
        if path.startswith("auth/session"):
            data = {"user": {"id": "layout-smoke", "username": "preview", "displayName": "布局测试",
                             "role": "user", "status": "active"}, "logicalModels": []}
        elif "catalog" in path:
            data = {"source": "system", "channels": [], "models": [], "logicalModels": []}
        elif "user-data" in path:
            data = {"items": []}
        elif "settings" in path or "appearance" in path or "wallet" in path:
            data = {}
        route.fulfill(json={"code": 0, "data": data, "msg": ""})

    page.route(base + "/api/**", api)
    page.goto(base + "/", wait_until="domcontentloaded")
    page.locator(".yx-entry-headline").wait_for(timeout=30000)
    page.wait_for_timeout(1500)
    page.get_by_role("button", name="进入创作空间", exact=True).click()
    page.get_by_text("和映雪聊聊创作想法", exact=True).wait_for(timeout=30000)
    for route in ["/home", "/create"]:
        # New documents intentionally start at the showcase; exercise in-app navigation.
        page.evaluate("to => window.dispatchEvent(new CustomEvent('workspace:navigate', {detail:{to}}))", route)
        page.wait_for_url(base + route)
        page.get_by_text("和映雪聊聊创作想法", exact=True).wait_for(timeout=30000)
        # Vite dev rendering is not an acceptable release gate.
        assert not page.locator('script[src*="/@vite/client"]').count()
        for mode in ["视频生成", "图片生成", "文本生成", "Agent", "视频生成"]:
            button = page.locator(".creation-mode-tabs").get_by_role("button", name=mode, exact=True)
            button.click()
            assert button.get_attribute("aria-pressed") == "true"
        editor = page.locator(".creation-chat-mention-editor")
        editor.fill("电影感海边日落")
        page.get_by_role("button", name="清空提示词和参考内容").click()
        assert not editor.inner_text().strip()
        page.get_by_role("button", name="添加更多参考内容").click()
        page.get_by_role("dialog").wait_for()
        page.keyboard.press("Escape")
        page.screenshot(path=str(out / (route[1:] + "-desktop.png")))
        assert not errors, errors
    page.set_viewport_size({"width": 390, "height": 844})
    page.screenshot(path=str(out / "mobile.png"))
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), page.evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth})")
    page.locator("html").evaluate("el => el.classList.add('dark')")
    page.screenshot(path=str(out / "mobile-dark.png"))
    assert not errors, errors
    receipt = {"passed": True, "base": base, "productionBundle": True, "apiFixtures": True,
               "routes": ["/home", "/create"], "pageErrors": errors}
    (out / "receipt.json").write_text(json.dumps(receipt), encoding="utf8")
    print(json.dumps(receipt))
    browser.close()
