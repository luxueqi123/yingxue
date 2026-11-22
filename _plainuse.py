import sys,re
p=sys.argv[1]
ls=open(p,encoding='utf-8').read().split('\n')
names=sys.argv[2:]
# mark conflict line ranges
conf=set()
i=0
while i<len(ls):
    if ls[i].startswith('<<<<<<<'):
        j=i
        while j<len(ls) and not ls[j].startswith('>>>>>>>'): j+=1
        for k in range(i,j+1): conf.add(k+1)
        i=j+1
    else: i+=1
for n in names:
    hits=[i for i,l in enumerate(ls,1) if re.search(r'\b'+re.escape(n)+r'\b',l)]
    plain=[h for h in hits if h not in conf]
    print(f'{n:34s} total={len(hits):3d} plain={plain}')
