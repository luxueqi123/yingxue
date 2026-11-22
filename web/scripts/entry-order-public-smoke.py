"""Read-only live entry check; real API, fresh anonymous browser contexts."""
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
    for path in ['/', '/home', '/canvas/saved-project']:
        context = browser.new_context(viewport={'width':1440, 'height':1000}, reduced_motion='reduce')
        context.add_init_script('''
            window.entryLoaders = [];
            new MutationObserver(() => {
                for (const node of document.querySelectorAll('.full-screen-loader'))
                    window.entryLoaders.push(node.textContent);
            }).observe(document, {childList:true, subtree:true});
        ''')
        page = context.new_page()
        page.set_default_timeout(90000)
        errors = []
        pending = set()
        page.on('request', lambda request: pending.add(request.url))
        page.on('requestfinished', lambda request: pending.discard(request.url))
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('requestfailed', lambda request: print('REQUEST_FAILED', request.url, request.failure, flush=True))
        page.goto(base + path, wait_until='domcontentloaded', timeout=90000)
        try:
            page.locator('.yx-entry-headline').wait_for()
        except Exception:
            diagnostic = {'path':path, 'url':page.url, 'errors':errors,
                          'text':page.locator('body').inner_text()[:2000],
                          'resources':page.evaluate("performance.getEntriesByType('resource').filter(x=>x.initiatorType==='script').map(x=>({name:x.name,duration:x.duration,size:x.transferSize}))")}
            (out / 'public-failure.json').write_text(json.dumps(diagnostic), encoding='utf8')
            print(json.dumps(diagnostic), flush=True)
            page.screenshot(path=str(out / 'public-failure.png'))
            raise
        page.wait_for_timeout(5000)
        assert page.url == base + '/', page.url
        assert page.evaluate('window.entryLoaders') == [], page.evaluate('window.entryLoaders')
        assert not errors, errors
        if path == '/':
            page.screenshot(path=str(out / 'public-home.png'))
            page.reload(wait_until='domcontentloaded', timeout=90000)
            page.locator('.yx-entry-headline').wait_for()
            assert page.evaluate('window.entryLoaders') == []
            page.get_by_role('button', name='进入创作空间', exact=True).click()
            try:
                page.get_by_role('dialog').wait_for()
            except Exception:
                diagnostic = {'stage':'login-dialog', 'errors':errors, 'pending':sorted(pending),
                              'text':page.locator('body').inner_text()[:2500]}
                (out / 'public-dialog-failure.json').write_text(json.dumps(diagnostic), encoding='utf8')
                print(json.dumps(diagnostic), flush=True)
                page.screenshot(path=str(out / 'public-dialog-failure.png'))
                raise
            assert page.url == base + '/'
        results.append({'path':path, 'landed':'/', 'loaders':[], 'pageErrors':errors})
        context.close()
    browser.close()
receipt = {'passed':True, 'base':base, 'apiFixtures':False, 'authenticatedTested':False, 'cases':results}
(out / 'public-receipt.json').write_text(json.dumps(receipt), encoding='utf8')
print(json.dumps(receipt))
