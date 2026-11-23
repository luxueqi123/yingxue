from pathlib import Path

W = Path('web/src/pages/create/index.tsx').read_text(encoding='utf-8').split('\n')
for a, b in [(1978, 1990), (2068, 2080)]:
    print('=== %d-%d' % (a, b))
    for i in range(a - 1, b):
        print('%5d| %s' % (i + 1, W[i]))
