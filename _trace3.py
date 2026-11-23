import sys
from pathlib import Path

path = sys.argv[1]
a = int(sys.argv[2])
b = int(sys.argv[3])
lines = Path(path).read_text(encoding='utf-8').split('\n')

# start depth = naive depth of everything before line a
d = 0
for l in lines[:a - 1]:
    d += l.count('{') - l.count('}')
print('depth entering line %d = %d' % (a, d))
for i in range(a - 1, min(b, len(lines))):
    l = lines[i]
    delta = l.count('{') - l.count('}')
    d += delta
    print('%5d d=%+d -> %3d | %s' % (i + 1, delta, d, l[:120]))
