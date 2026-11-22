import re
w=open('web/src/pages/create/index.tsx',encoding='utf-8').read()
for m in re.finditer(r'mode \|\| "video"', w):
    print('WHERE:', repr(w[max(0,m.start()-120):m.end()+40]))
print('--- ws onContinueCanvas ---')
ws=open('web/src/pages/create/creation-workspace.tsx',encoding='utf-8').read()
for i,l in enumerate(ws.split('\n'),1):
    if 'onContinueCanvas' in l or 'openingCanvas' in l: print(i, l.strip()[:170])
