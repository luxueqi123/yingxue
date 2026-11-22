from pathlib import Path

O = Path('_c_orig.tsx').read_text(encoding='utf-8').split('\n')
H = Path('_c_head.tsx').read_text(encoding='utf-8').split('\n')


def dump(S, a, b, tag):
    print('=== %s %d-%d' % (tag, a, b))
    for i in range(a - 1, min(b, len(S))):
        print('%5d| %s' % (i + 1, S[i]))


dump(O, 545, 640, 'ORIG')
dump(O, 800, 900, 'ORIG')
dump(H, 646, 700, 'HEAD')
