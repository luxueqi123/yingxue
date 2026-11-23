import sys
p=sys.argv[1]
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
        print(f'##### B{idx}  lines {i+1}-{end+1}  (HEAD {mid-i-1} lines / ORIGIN {end-mid-1} lines)')
        print('--- HEAD ---')
        for j in range(i+1,mid): print(f'{j+1}: {ls[j]}')
        print('--- ORIGIN ---')
        for j in range(mid+1,end): print(f'{j+1}: {ls[j]}')
        i=end+1
    else:
        i+=1
