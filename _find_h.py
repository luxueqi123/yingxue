import subprocess
from pathlib import Path

P = 'web/src/pages/create/index.tsx'


def lines(ref):
    raw = subprocess.run(['git', 'show', ref + ':' + P], capture_output=True).stdout
    return raw.decode('utf-8').replace('\r\n', '\n').split('\n')


H, O = lines('HEAD'), lines('MERGE_HEAD')


def locate(seg, src, tag):
    hits = []
    for j in range(len(src) - len(seg) + 1):
        if src[j:j + len(seg)] == seg:
            hits.append((j + 1, j + len(seg)))
    print('%-8s %s' % (tag, hits))


print('## HEAD(629,634) content')
for i in range(628, 635):
    print('%5d| %s' % (i + 1, H[i]))
print()
locate(H[628:634], H, 'HEAD')
locate(H[628:634], O, 'ORIG')
print()
print('## HEAD(1244,1251)')
for i in range(1243, 1252):
    print('%5d| %s' % (i + 1, H[i]))
print()
print('## HEAD(655,671)')
for i in range(654, 672):
    print('%5d| %s' % (i + 1, H[i]))
print()
print('## ORIG(147,155) / (52,58)')
for i in range(146, 156):
    print('O%5d| %s' % (i + 1, O[i]))
for i in range(51, 59):
    print('O%5d| %s' % (i + 1, O[i]))
print()
print('## ORIG(161,169)')
for i in range(160, 170):
    print('O%5d| %s' % (i + 1, O[i]))
print()
print('## ORIG(87,87) and ORIG(177,201)')
print('O88 |', O[86])
for i in range(176, 202):
    print('O%5d| %s' % (i + 1, O[i]))
