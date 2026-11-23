import sys,re
p=sys.argv[1]
ls=open(p,encoding='utf-8').read().split('\n')
head=open(sys.argv[2],encoding='utf-8').read().split('\n')
orig=open(sys.argv[3],encoding='utf-8').read().split('\n')
def norm(a): return [l.rstrip() for l in a if l.strip()]
H=norm(head); O=norm(orig)
# build set of origin lines
Hs=set(H); Os=set(O)
i=0
segs=[]
cur=[]
start=1
while i<len(ls):
    l=ls[i]
    if l.startswith('<<<<<<<'):
        if cur: segs.append((start,i,'plain',cur)); cur=[]
        j=i
        # find markers
        mid=None; end=None
        k=i+1
        while k<len(ls):
            if ls[k].startswith('======='): mid=k
            if ls[k].startswith('>>>>>>>'): end=k; break
            k+=1
        segs.append((i+1,end+1,'conflict',None))
        i=end+1; start=i+1; continue
    cur.append(l); i+=1
if cur: segs.append((start,len(ls),'plain',cur))
for (a,b,kind,body) in segs:
    if kind=='conflict':
        print(f'{a}-{b} CONFLICT')
    else:
        nb=[x.rstrip() for x in body if x.strip()]
        # classify: how many lines appear in HEAD vs ORIGIN
        hc=sum(1 for x in nb if x in Hs); oc=sum(1 for x in nb if x in Os)
        tot=len(nb)
        verdict='?'
        if tot==0: verdict='empty'
        elif hc==tot and oc<tot: verdict='HEAD-only'
        elif oc==tot and hc<tot: verdict='ORIGIN-only'
        elif hc==tot and oc==tot: verdict='both'
        elif hc/tot>0.6: verdict=f'mostly-HEAD({hc}/{tot})'
        elif oc/tot>0.6: verdict=f'mostly-ORIGIN({oc}/{tot})'
        else: verdict=f'mixed h={hc} o={oc} n={tot}'
        print(f'{a}-{b} plain {verdict}')
