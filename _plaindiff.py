import re,sys
p=sys.argv[1]; ref=sys.argv[2]
ls=open(p,encoding='utf-8').read().split('\n')
refs=set(l.strip() for l in open(ref,encoding='utf-8').read().split('\n') if l.strip())
i=0;n=len(ls);out=[]
while i<n:
    if ls[i].startswith('<<<<<<<'):
        j=i
        while j<n and not ls[j].startswith('>>>>>>>'): j+=1
        i=j+1; continue
    s=ls[i].strip()
    if s and s not in refs:
        out.append((i+1,ls[i]))
    i+=1
for ln,l in out: print(f'{ln}: {l}')
print('TOTAL',len(out))
