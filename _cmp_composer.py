import difflib
import subprocess
from pathlib import Path


def txt(ref, p):
    if ref == 'WORK':
        return Path(p).read_text(encoding='utf-8').split('\n')
    return subprocess.run(['git', 'show', ref + ':' + p], capture_output=True).stdout.decode('utf-8').replace('\r\n', '\n').split('\n')


def slice_fn(lines, name, end_marker):
    start = None
    for i, l in enumerate(lines):
        if l.startswith('function ' + name + '(') or l.startswith('export function ' + name + '('):
            start = i
            break
    if start is None:
        return None
    depth = 0
    for i in range(start, len(lines)):
        depth += lines[i].count('{') - lines[i].count('}')
        if depth == 0 and i > start:
            return (start + 1, i + 1, lines[start:i + 1])
    return None


hi = txt('HEAD', 'web/src/pages/create/index.tsx')
mw = txt('MERGE_HEAD', 'web/src/pages/create/creation-workspace.tsx')

a = slice_fn(hi, 'CreationComposer', None)
b = slice_fn(mw, 'CreationComposer', None)
print('HEAD index CreationComposer  :', a and (a[0], a[1], a[1] - a[0] + 1))
print('MERGE workspace CreationComposer:', b and (b[0], b[1], b[1] - b[0] + 1))

if a and b:
    d = list(difflib.unified_diff(a[2], b[2], 'index/HEAD', 'workspace/MERGE', lineterm='', n=1))
    print('diff line count:', len(d))
    Path('.local/cache/_composer_head_vs_workspace.diff').write_text('\n'.join(d), encoding='utf-8')
    print('written .local/cache/_composer_head_vs_workspace.diff')
    for l in d[:120]:
        print(l)
