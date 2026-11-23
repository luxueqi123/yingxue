import re,sys,json

def blocks(path):
    src=open(path,encoding='utf-8').read()
    lines=src.split('\n')
    out={}
    i=0
    n=len(lines)
    while i<n:
        m=re.match(r'^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(',lines[i])
        m2=re.match(r'^(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*[:=]',lines[i])
        name=None; kind=None
        if m: name=m.group(1); kind='fn'
        elif m2: name=m2.group(1); kind='var'
        if not name:
            i+=1; continue
        # brace/paren matching from this line
        buf=[]
        depth=0; started=False; j=i
        while j<n:
            line=lines[j]
            buf.append(line)
            for ch in line:
                if ch in '{[(': depth+=1; started=True
                elif ch in '}])': depth-=1
            if started and depth<=0:
                break
            j+=1
        text='\n'.join(buf)
        out.setdefault(name,[]).append((i+1,j+1,text))
        i=j+1
    return out

a=blocks(sys.argv[1]); b=blocks(sys.argv[2])
same=[];diff=[];onlya=[];onlyb=[]
for k in sorted(set(a)|set(b)):
    if k in a and k in b:
        ta=a[k][0][2]; tb=b[k][0][2]
        if ta.strip()==tb.strip(): same.append(k)
        else: diff.append(k)
    elif k in a: onlya.append(k)
    else: onlyb.append(k)
print('SAME :',len(same))
print('DIFF :',diff)
print('ONLY1:',onlya)
print('ONLY2:',onlyb)
