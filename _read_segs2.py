from pathlib import Path


def dump(path, a, b, tag):
    L = Path(path).read_text(encoding='utf-8').split('\n')
    print('=== %s  %s  %d-%d  (total %d)' % (tag, path, a, b, len(L)))
    for i in range(a - 1, min(b, len(L))):
        print('%5d| %s' % (i + 1, L[i]))


dump('_c_orig.tsx', 150, 240, 'ORIG index')
dump('_c_orig.tsx', 300, 390, 'ORIG index')
