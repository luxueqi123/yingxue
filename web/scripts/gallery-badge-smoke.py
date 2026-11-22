"""Production gallery badge check with isolated auth fixtures; no business writes."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip('/')
out = Path(__file__).resolve().parents[2] / '.local/cache/home-curation'
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width':1440, 'height':1000}, reduced_motion='reduce')
    page.set_default_timeout(60000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    def api(route):
        assert route.request.method in ('GET', 'OPTIONS')
        path = route.request.url.split('/api/', 1)[1]
        data = []
        if path.startswith('auth/session'):
            data = {'user':{'id':'badge-smoke', 'username':'preview', 'displayName':'验证', 'role':'user', 'status':'active'}, 'logicalModels':[]}
        elif 'catalog' in path:
            data = {'source':'system', 'channels':[], 'models':[], 'logicalModels':[]}
        elif 'user-data' in path:
            data = {'items':[]}
        elif any(x in path for x in ['settings', 'appearance', 'wallet']):
            data = {}
        route.fulfill(json={'code':0, 'data':data, 'msg':''})
    page.route(base + '/api/**', api)
    page.goto(base + '/', wait_until='domcontentloaded')
    page.locator('.yx-entry-headline').wait_for()
    page.wait_for_timeout(1500)
    page.get_by_role('button', name='进入创作空间', exact=True).click()
    page.get_by_text('和映雪聊聊创作想法', exact=True).wait_for()
    for path in ['/home', '/studio?tab=cases']:
        page.evaluate("to => window.dispatchEvent(new CustomEvent('workspace:navigate', {detail:{to}}))", path)
        page.wait_for_url(base + path)
        badges = page.locator('.inspiration-card-corner')
        badges.first.wait_for()
        assert badges.count() > 0
        assert badges.evaluate_all("nodes => nodes.every(n => !n.textContent.trim() && !!n.getAttribute('aria-label'))")
        assert '本地原片' not in page.locator('body').inner_text()
    page.locator('.inspiration-gallery').screenshot(path=str(out / 'gallery.png'))
    assert not errors, errors
    receipt = {'passed':True, 'base':base, 'apiFixtures':True, 'routes':['/home','/studio?tab=cases'], 'pageErrors':errors}
    (out / 'gallery-receipt.json').write_text(json.dumps(receipt), encoding='utf8')
    print(json.dumps(receipt))
    browser.close()
