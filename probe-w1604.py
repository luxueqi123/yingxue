import json, glob, os

targets = {
 '7b2a364e': ['v-RmWi1lvY3b','v-TfvBaaeVIe','v-vw4nxtBSqd'],
 '4ea3d9ee': ['v-IOQRRFqVqJ','v-pIvKFvF7Ak'],
 '714c8ba7': ['2f636b52-6396-4a1b-94d0-a1927f0efb1f'],
 '784f1408': ['11bb1b46-e6f4-45c3-9720-7d2ef02a5aaa','b9c38756-e2cd-4619-91bb-147fb7aa78f1'],
 'd485f712': ['a2b355bf-f29d-431b-8a65-294948c10ba1'],
 '992a0e82': ['479bbe32-a7e0-4248-afe0-5c615a1f9196'],
 'd060cf7c': ['v-hciIIKiDYC'],
 'ec76b8b2': ['c2348bab-0695-46d0-88df-7023d5612e90'],
 '97fcaf5e': ['894cccc1-c133-472c-a410-4f6424053597','f56c45dc-7525-4520-af46-a809beed4439'],
 'a52cfa15': ['08362efd-0d9a-4103-9b6d-96f9074ef22a','4144095b-b088-4405-84de-b8b75e9bab71','51cd30b3-fd53-4f8e-a02b-2a1d43ff7862','e74749e5-f3e1-48e1-9da9-7b8d846ba5ce','fcad8035-5729-458d-a2ae-faa3353b93ed'],
 'cdd799b0': ['2624349e-d677-4f69-aaa7-e76e8fae982c','dd724068-babe-4dae-a9cc-00ce6650f637','f17d01cd-df20-4cc7-9645-6877e5f174cc','f64963d1-6424-4fca-86d3-f615c3ffc55c'],
 '42027eaa': ['v-6LGDa2r439','v-q4rBjW0CQE','v-uBoGkSIqkx'],
 'e571dfba': ['517ee172-ed79-4d3f-af23-8e83845c4ec9','9361ac59-2a73-4db7-8a68-93e30aafaa9e'],
 '231b95ec': ['56005e4c-c0e2-4229-8748-0a99d5f58cef','a5c26d32-1a5b-4857-af36-a5f1618b5bc1'],
}
audit = '.local/cache/case-chain-audit'
dec = json.load(open('.local/cache/native-cases-r38/decisions.json', encoding='utf-8'))
bycase = {r['id'].replace('case-','')[:8]: r['id'] for r in dec['pendingCases']}
out = []
for sfx, nodes in targets.items():
    case_id = bycase[sfx]
    snap = json.loads(json.load(open(f'{audit}/{case_id.replace("case-","")}.json', encoding='utf-8'))['data']['detail']['snapshotData'])
    for nid in nodes:
        incoming = [e for e in snap['edges'] if e.get('target') == nid]
        owner_kinds = []
        for e in incoming:
            o = next((n for n in snap['nodes'] if n['id'] == e.get('source')), None)
            owner_kinds.append((e.get('source'), (o or {}).get('type'), str(((o or {}).get('data') or {}).get('action'))))
        out.append(f"{sfx} {nid} incoming={len(incoming)} {owner_kinds}")
open('D:/天琊书客/项目/天琊映雪无限画布/.local/cache/w1604-incoming.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('\n'.join(out))
