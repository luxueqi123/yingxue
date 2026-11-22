import sys,re
p=sys.argv[1]
needles=sys.argv[2:]
ls=open(p,encoding='utf-8').read().split('\n')
i=0;n=len(ls);idx=0
while i<n:
    if ls[i].startswith('<<<<<<<'):
        idx+=1
        k=i+1; mid=None; end=None
        while k<n:
            if ls[k].startswith('=======') and mid is None: mid=k
            if ls[k].startswith('>>>>>>>'): end=k; break
            k+=1
        head=[(j+1,ls[j]) for j in range(i+1,mid)]
        orig=[(j+1,ls[j]) for j in range(mid+1,end)]
        for nz in needles:
            hh=[t for t in head if nz in t[1]]
            oo=[t for t in orig if nz in t[1]]
            if hh or oo:
                print(f'B{idx} ({i+1}-{end+1}) needle={nz!r} HEAD={len(hh)} ORIG={len(oo)}')
                for ln,l in (hh+oo)[:6]:
                    print(f'    {ln}: {l.strip()[:150]}')
        i=end+1
    else: i+=1
