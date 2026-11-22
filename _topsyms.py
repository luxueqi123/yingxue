import re,sys
def syms(p):
    out={}
    for i,l in enumerate(open(p,encoding="utf-8").read().split("\n"),1):
        m=re.match(r'^(?:export\s+)?(?:default\s+)?(?:async\s+)?(function|const|let|type|interface|class)\s+([A-Za-z_$][\w$]*)',l)
        if m: out.setdefault(m.group(2),[]).append(i)
    return out
a=syms(sys.argv[1]); b=syms(sys.argv[2])
print("only in 1:",sorted(set(a)-set(b)))
print("only in 2:",sorted(set(b)-set(a)))
print("both:",len(set(a)&set(b)))
