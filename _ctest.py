import os,re
files=[f for f in os.listdir('web/test') if f.endswith(('.ts','.tsx','.mjs'))]
targets=('pages/create/index.tsx','pages/create/creation-workspace.tsx')
for f in sorted(files):
    p=os.path.join('web/test',f)
    s=open(p,encoding='utf-8',errors='ignore').read()
    if not any(t in s for t in targets): continue
    print('#### '+f)
    ls=s.split('\n')
    # find ReadFile/Bun.file lines and their variable name
    for i,l in enumerate(ls,1):
        if 'pages/create/index.tsx' in l or 'pages/create/creation-workspace.tsx' in l:
            print(f'  {i}: {l.strip()[:150]}')
