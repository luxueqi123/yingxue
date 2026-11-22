from pathlib import Path


def dump(path, a, b, tag):
    L = Path(path).read_text(encoding='utf-8').split('\n')
    print('=== %s  %s  %d-%d  (total %d)' % (tag, path, a, b, len(L)))
    for i in range(a - 1, min(b, len(L))):
        print('%5d| %s' % (i + 1, L[i]))


dump('web/src/pages/create/index.tsx', 1478, 1545, 'WORK index ComposerProps')
dump('web/src/pages/create/index.tsx', 1884, 1930, 'WORK index EmptyBanner/Suggest')
