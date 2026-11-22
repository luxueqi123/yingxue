import json

audit = '.local/cache/case-chain-audit'
dec = json.load(open('.local/cache/native-cases-r38/decisions.json', encoding='utf-8'))
bycase = {r['id'].replace('case-', '')[:8]: r['id'] for r in dec['pendingCases']}
targets = {
 '714c8ba7': ['2f636b52-6396-4a1b-94d0-a1927f0efb1f'],
 '784f1408': ['11bb1b46-e6f4-45c3-9720-7d2ef02a5aaa', 'b9c38756-e2cd-4619-91bb-147fb7aa78f1', '4ed5cb98-e588-44ef-acfb-fe1968213910'],
 '992a0e82': ['479bbe32-a7e0-4248-afe0-5c615a1f9196'],
 'd060cf7c': ['v-hciIIKiDYC'],
 'ec76b8b2': ['c2348bab-0695-46d0-88df-7023d5612e90'],
 'a52cfa15': ['08362efd-0d9a-4103-9b6d-96f9074ef22a'],
 'cdd799b0': ['2624349e-d677-4f69-aaa7-e76e8fae982c'],
 '7b2a364e': ['v-RmWi1lvY3b'],
 '4ea3d9ee': ['v-IOQRRFqVqJ'],
 '97fcaf5e': ['4398d4b3-478d-4f37-9f0f-12e592c9ac7c'.replace('7c','7d')],
}
out = []
for sfx, nodes in targets.items():
    cid = bycase[sfx]
    snap = json.loads(json.load(open(f'{audit}/' + cid.replace('case-', '') + '.json', encoding='utf-8'))['data']['detail']['snapshotData'])
    for nid in nodes:
        n = next((x for x in snap['nodes'] if x['id'] == nid), None)
        if not n:
            out.append(f'{sfx} {nid} MISSING')
            continue
        d = n.get('data') or {}
        p = d.get('params') or {}
        keep = {k: v for k, v in p.items() if k not in ('imageList','videoList','audioList','mixedList','prompt','imageListOrder','videoListOrder','audioListOrder','mixedListOrder')}
        out.append(f"{sfx} {nid} action={d.get('action')} retryMeta={json.dumps(d.get('_retryMeta'), ensure_ascii=False)[:160]}\n    params={json.dumps(keep, ensure_ascii=False)[:700]}")
open('D:/天琊书客/项目/天琊映雪无限画布/.local/cache/w1605-raw.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('\n'.join(out))
