"""Real production UI/graph with in-memory API boundary; never calls a generation provider."""
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[2]
out = root / '.local/cache/asset-audit-20260922'
base = sys.argv[1].rstrip('/')
if urlsplit(base).hostname not in ('127.0.0.1', 'localhost'):
    out = out / 'public'
out.mkdir(parents=True, exist_ok=True)
case_id = 'case-241dafd71d83411c8ef3d315116f190e'
title = '呱比的奇妙冒险之旅'
if len(sys.argv) > 2:
    case_id = sys.argv[2]
    out = out / case_id
    out.mkdir(parents=True,exist_ok=True)
support = json.loads((root / 'web/src/lib/production-case-support.json').read_text(encoding='utf8'))
entry = next(x for x in support if x['id'] == case_id)
source = json.loads((root / 'web/public' / entry['snapshotPath'].lstrip('/')).read_text(encoding='utf8'))
if len(sys.argv) > 2:
    title = source['title']
assets, projects, writes, errors, reads = {}, {}, [], [], []
allow_copy = False
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width':1440, 'height':1000}, reduced_motion='reduce')
    page.set_default_timeout(90000)
    def record_error(e):
        errors.append(str(e))
        print('PAGEERROR: ' + str(e), flush=True)
    page.on('pageerror', record_error)
    pending = set()
    page.on('request', lambda r: pending.add(urlsplit(r.url).path))
    page.on('requestfinished', lambda r: pending.discard(urlsplit(r.url).path))
    page.on('requestfailed', lambda r: pending.discard(urlsplit(r.url).path))
    def api(route):
        path = urlsplit(route.request.url).path.removeprefix('/api/')
        method = route.request.method
        if method == 'GET': reads.append(path)
        data = {}
        if method not in ('GET', 'OPTIONS'):
            assert allow_copy, 'Read-only preview attempted write: ' + path
            body = route.request.post_data_json
            assert path.startswith(('assets/', 'canvas-projects/')), 'Unexpected operation: ' + path
            if method == 'PUT' and path.startswith('assets/'):
                asset = body['asset']; assets[asset['id']] = asset; data = {'asset':asset}
            elif method == 'PUT' and path.startswith('canvas-projects/'):
                project = body['project']; project['revision'] = projects.get(project['id'], {}).get('revision', 0) + 1
                projects[project['id']] = project; data = {'project':project}
            elif method == 'POST' and path == 'assets/batch':
                data = {'assets':[assets[i] for i in body['ids'] if i in assets]}
            else:
                raise AssertionError('Unexpected write: ' + path)
            writes.append({'method':method,'path':path})
        elif path.startswith('auth/session'):
            data = {'user':{'id':'case-process-smoke','username':'preview','displayName':'工程验证','role':'user','status':'active'},'logicalModels':[]}
        elif 'catalog' in path:
            data = {'source':'system','channels':[],'models':[],'logicalModels':[]}
        elif path.startswith('canvas-projects/'):
            ident = path.split('/')[1]
            data = {'project':projects.get(ident)}
        elif path == 'canvas-projects':
            data = {'projects':list(projects.values()),'total':len(projects),'hasMore':False,'page':1,'pageSize':24}
        elif path.startswith('assets/'):
            data = {'asset':assets.get(path.split('/')[1])}
        elif path == 'assets':
            data = {'assets':list(assets.values()),'total':len(assets),'hasMore':False,'page':1,'pageSize':24,'kindCounts':{},'categoryCounts':{},'folderCounts':{}}
        elif path == 'user-data/snapshot':
            data = {'projects':list(projects.values()),'assets':list(assets.values())}
        elif path == 'asset-folders':
            data = {'folders':[]}
        elif path.startswith('plugins/runtime'):
            data = {'statuses':{},'states':{}}
        elif any(x in path for x in ('announcements','tasks','plugins')):
            data = []
        route.fulfill(json={'code':0,'data':data,'msg':''})
    page.route(base + '/api/**', api)
    page.goto(base + '/',wait_until='domcontentloaded')
    try:
        page.locator('.yx-entry-headline').wait_for(timeout=45000)
    except Exception:
        (out / 'entry-failure.json').write_text(json.dumps({'pending':sorted(pending),'errors':errors}),encoding='utf8')
        page.screenshot(path=str(out / 'entry-failure.png'))
        raise
    page.wait_for_timeout(1500)
    page.get_by_role('button',name='进入创作空间',exact=True).click()
    page.get_by_text('和映雪聊聊创作想法',exact=True).wait_for()
    page.evaluate("window.dispatchEvent(new CustomEvent('workspace:navigate',{detail:{to:'/studio?tab=cases'}}))")
    page.wait_for_url('**/studio?tab=cases')
    page.get_by_role('heading',name='从真实案例寻找创作方向',exact=True).wait_for()
    page.get_by_text('共 337 个案例',exact=True).wait_for()
    page.get_by_role('textbox',name='搜索灵感案例').fill(title)
    page.wait_for_timeout(2000)
    initial_search_preserved = page.get_by_role('textbox',name='搜索灵感案例').input_value() == title
    if not initial_search_preserved:
        print('DEFECT: initial search reset; explicitly re-entering to inspect downstream case flow',flush=True)
        page.get_by_role('textbox',name='搜索灵感案例').fill(title)
        page.get_by_text('共 1 个案例',exact=True).wait_for()
    # Refreshed catalogue may replace cards once media metadata arrives.
    corrupt = True
    def snapshot(route):
        if corrupt:
            route.fulfill(body=b'{}', content_type='application/json')
        else:
            route.continue_()
    page.route('**' + entry['snapshotPath'], snapshot)
    try:
        page.get_by_role('button',name='查看案例 ' + title,exact=True).click(timeout=20000)
    except Exception:
        page.screenshot(path=str(out / 'case-open-failure.png'))
        (out / 'case-open-failure.txt').write_text(page.locator('body').inner_text(),encoding='utf8')
        raise
    page.get_by_text('案例工程校验失败，未创建画布。',exact=True).wait_for()
    assert page.get_by_role('button',name='复制项目并编辑',exact=True).is_disabled()
    assert not writes
    corrupt = False
    page.get_by_role('button',name='重新加载工程',exact=True).click()
    graph = page.get_by_test_id('case-workflow')
    graph.wait_for()
    assert graph.locator('[data-node-id]').count() == entry['nodeCount']
    assert graph.locator('[data-connection-id]').count() == entry['connectionCount']
    assert set(graph.locator('[data-node-id]').evaluate_all('els=>els.map(e=>e.dataset.nodeId)')) == {n['id'] for n in source['nodes']}
    assert not writes, writes
    zoom_label = page.get_by_label('预览缩放比例')
    before_zoom = zoom_label.inner_text()
    bounds = graph.bounding_box()
    page.mouse.move(bounds['x'] + 40,bounds['y'] + 50)
    page.mouse.wheel(0,-300)
    page.wait_for_function('(before)=>document.querySelector("[aria-label=预览缩放比例]").textContent !== before',arg=before_zoom)
    first_node = graph.locator('[data-node-id]').first
    before_pan = first_node.bounding_box()
    page.mouse.move(bounds['x'] + 20,bounds['y'] + 20)
    page.mouse.down()
    page.mouse.move(bounds['x'] + 100,bounds['y'] + 70,steps=8)
    page.mouse.up()
    page.wait_for_timeout(300)
    after_pan = first_node.bounding_box()
    assert abs(after_pan['x'] - before_pan['x']) > 20, 'Canvas drag did not pan'
    page.get_by_role('button',name='适应全部节点',exact=True).click()
    page.wait_for_function('()=>Array.from(document.querySelectorAll("[data-testid=case-workflow] img")).some(img=>img.complete && img.naturalWidth>0)',timeout=45000)
    try:
        page.wait_for_function('()=>Array.from(document.querySelectorAll("[data-testid=case-workflow] img")).every(img=>img.complete)',timeout=30000)
    except Exception:
        pass  # Capture partial media availability separately; graph/persistence assertions remain strict.
    media_count = graph.locator('img').evaluate_all('els=>({total:els.length,loaded:els.filter(e=>e.complete&&e.naturalWidth>0).length})')
    graph.locator('button[data-node-id]').first.click()
    page.get_by_role('heading',name='保存的模型参数',exact=True).wait_for()
    page.screenshot(path=str(out / 'workflow-desktop.png'))
    page.get_by_role('button',name='素材',exact=True).click()
    page.get_by_test_id('case-materials').wait_for()
    page.screenshot(path=str(out / 'materials-desktop.png'))
    assert not writes, writes
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(out / 'materials-mobile.png'))
    page.set_viewport_size({'width':1440,'height':1000})
    allow_copy = True
    page.get_by_role('button',name='复制项目并编辑',exact=True).click()
    page.wait_for_url('**/canvas/*')
    page.locator('[data-node-id]').first.wait_for()
    assert len(projects) == 1, projects.keys()
    saved = next(iter(projects.values()))
    assert len(saved['nodes']) == len(source['nodes'])
    assert len(saved['connections']) == len(source['connections'])
    assert not {n['id'] for n in saved['nodes']} & {n['id'] for n in source['nodes']}
    # Refresh deliberately goes to the homepage; return via in-app navigation and load saved graph.
    ident = saved['id']
    reads.clear()
    page.reload(wait_until='domcontentloaded')
    page.locator('.yx-entry-headline').wait_for()
    page.wait_for_timeout(1500)
    page.get_by_role('button',name='进入创作空间',exact=True).click()
    page.get_by_text('和映雪聊聊创作想法',exact=True).wait_for()
    page.evaluate("to=>window.dispatchEvent(new CustomEvent('workspace:navigate',{detail:{to}}))",'/canvas/' + ident)
    page.wait_for_url('**/canvas/' + ident)
    page.locator('[data-node-id]').first.wait_for()
    assert 'canvas-projects/' + ident in reads, 'Saved project was not requested after reload'
    assert len(projects[ident]['nodes']) == entry['nodeCount']
    assert not errors, errors
    receipt = {'passed':initial_search_preserved,'caseFlowPassed':True,'initialSearchPreserved':initial_search_preserved,'base':base,'apiFixtures':True,'caseId':case_id,'nodes':entry['nodeCount'],'connections':entry['connectionCount'],'readOnlyWrites':0,'copySaved':True,'reopened':True,'corruptSnapshotBlocked':True,'retryRecovered':True,'wheelZoom':True,'dragPan':True,'workflowImages':media_count,'realBackendTested':False,'pageErrors':errors}
    (out / 'case-process-receipt.json').write_text(json.dumps(receipt),encoding='utf8')
    print(json.dumps(receipt))
    assert initial_search_preserved, 'Initial search was reset; case flow passed only after manually re-entering search'
    browser.close()
