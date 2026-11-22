"""Production-bundle entry-order regression; API fixtures, no business writes."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip('/')
out = Path(__file__).resolve().parents[2] / '.local/cache/entry-order'
out.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    for authenticated in [False, True]:
        context = browser.new_context(reduced_motion='reduce')
        context.add_init_script('''
            window.entryLoaders = [];
            new MutationObserver(() => {
                for (const node of document.querySelectorAll('.full-screen-loader'))
                    window.entryLoaders.push(node.textContent);
            }).observe(document, {childList:true, subtree:true});
        ''')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))

        def api(route):
            path = route.request.url.split('/api/', 1)[1]
            assert route.request.method in ('GET', 'OPTIONS'), path
            data = []
            if path.startswith('auth/session'):
                data = {'user': {'id':'entry-smoke', 'username':'preview', 'displayName':'测试',
                        'role':'user', 'status':'active'} if authenticated else None, 'logicalModels':[]}
            elif 'catalog' in path:
                data = {'source':'system', 'channels':[], 'models':[], 'logicalModels':[]}
            elif 'user-data' in path:
                data = {'items':[]}
            elif any(key in path for key in ['settings', 'appearance', 'wallet']):
                data = {}
            route.fulfill(json={'code':0, 'data':data, 'msg':''})

        page.route(base + '/api/**', api)
        # Delay lazy route/init modules so transient loaders cannot evade observation.
        def chunk(route):
            import time
            time.sleep(0.08)
            route.continue_()
        page.route('**/assets/*.js', chunk)
        for path in ['/', '/home', '/canvas/saved-project', '/projects/saved-project']:
            page.goto(base + path, wait_until='domcontentloaded', timeout=90000)
            page.locator('.yx-entry-headline').wait_for(timeout=90000)
            page.wait_for_timeout(1500)
            assert page.url == base + '/', page.url
            assert page.evaluate('window.entryLoaders') == [], page.evaluate('window.entryLoaders')
            assert not errors, errors
            results.append({'authenticatedFixture':authenticated, 'path':path, 'loaders':[]})
        page.reload(wait_until='domcontentloaded')
        page.locator('.yx-entry-headline').wait_for()
        assert page.evaluate('window.entryLoaders') == []
        page.screenshot(path=str(out / ('signed-in.png' if authenticated else 'anonymous.png')))
        if authenticated:
            page.wait_for_timeout(1500)
            page.get_by_role('button', name='进入创作空间', exact=True).click()
            page.get_by_text('和映雪聊聊创作想法', exact=True).wait_for(timeout=90000)
            assert page.url == base + '/home'
        else:
            page.get_by_role('button', name='进入创作空间', exact=True).click()
            page.get_by_role('dialog').wait_for(timeout=30000)
            assert page.url == base + '/'
        assert not errors, errors
        context.close()
    browser.close()
receipt = {'passed':True, 'base':base, 'apiFixtures':True, 'cases':results,
           'reload':True, 'activeEntry':True}
(out / 'receipt.json').write_text(json.dumps(receipt), encoding='utf8')
print(json.dumps(receipt))
