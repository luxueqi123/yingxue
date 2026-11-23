import os,re
files=[]
for base in ('web/test',):
    for dp,dn,fn in os.walk(base):
        for f in fn:
            p=os.path.join(dp,f)
            if not f.endswith(('.ts','.tsx','.mjs','.js')): continue
            s=open(p,encoding='utf-8',errors='ignore').read()
            if 'pages/create/index.tsx' in s: files.append(p)
print('FILES:',files)
head=open('.local/cache/_head_create.tsx',encoding='utf-8').read()
orig=open('.local/cache/_orig_create.tsx',encoding='utf-8').read()
work=open('web/src/pages/create/index.tsx',encoding='utf-8').read()
lits=set()
for p in files:
    s=open(p,encoding='utf-8',errors='ignore').read()
    for m in re.finditer(r'\.(?:toContain|not\.toContain)\(\s*(["\'])(.*?)\1',s,re.S):
        lits.add(m.group(2))
    for m in re.finditer(r'\.(?:toContain|not\.toContain)\(\s*`([^`]*)`',s):
        lits.add(m.group(1))
rows=[]
for l in sorted(lits):
    h='HEAD' if l in head else '  - '
    o='ORIG' if l in orig else '  - '
    w='WORK' if l in work else '  - '
    rows.append((h,o,w,l))
print(f'{"HEAD":4} {"ORIG":4} {"WORK":4}  literal')
for h,o,w,l in rows:
    print(f'{h:4} {o:4} {w:4}  {l[:150]}')
print('TOTAL',len(rows))
