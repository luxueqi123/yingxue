from pathlib import Path

L = Path('web/src/pages/create/index.tsx').read_text(encoding='utf-8').split('\n')


def dump(a, b):
    print('----- %d-%d' % (a, b))
    for i in range(a - 1, min(b, len(L))):
        print('%5d| %s' % (i + 1, L[i]))


dump(294, 320)
dump(688, 762)
dump(1140, 1226)
