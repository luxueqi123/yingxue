import re,sys
p='web/src/pages/create/index.tsx'
s=open(p,encoding='utf-8').read()
lines=s.split('\n')
names=sys.argv[1:]
for n in names:
    hits=[i for i,l in enumerate(lines,1) if re.search(r'\b'+re.escape(n)+r'\b',l)]
    print(f'{n:38s} {hits}')
