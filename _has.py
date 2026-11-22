import sys
p=sys.argv[1]
s=open(p,encoding="utf-8").read()
for t in sys.argv[2:]:
    print(f'{t:42s} {s.count(t)}')
