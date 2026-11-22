import os,re
root='web'
pats=re.compile(r'pages/create/|\./creation-(workspace|conversations|types|agent-entry|submit-gate|inspirations|runtime|references|assets|input-policy)')
for base in ('web/src','web/test'):
    for dp,dn,fn in os.walk(base):
        if 'node_modules' in dp: continue
        for f in fn:
            if not f.endswith(('.ts','.tsx','.mjs','.js')): continue
            p=os.path.join(dp,f)
            for i,l in enumerate(open(p,encoding='utf-8',errors='ignore'),1):
                if pats.search(l):
                    print(f'{p}:{i}: {l.rstrip()[:150]}')
