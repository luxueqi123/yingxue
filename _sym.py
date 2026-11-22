import os,re,sys
names=sys.argv[1:]
hits={n:[] for n in names}
for base in ('web/src','web/test'):
    for dp,dn,fn in os.walk(base):
        if 'node_modules' in dp: continue
        for f in fn:
            if not f.endswith(('.ts','.tsx','.css','.mjs','.js')): continue
            p=os.path.join(dp,f)
            try: s=open(p,encoding='utf-8',errors='ignore').read()
            except: continue
            for n in names:
                if n in s: hits[n].append(p)
for n in names:
    print(f'{n:34s} {len(hits[n]):3d}  {hits[n][:6]}')
