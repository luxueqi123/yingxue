"""Diff 映雪's main-tree working copy against the integration HEAD snapshot."""

import difflib
import subprocess
from pathlib import Path

MAIN = r'D:\天琊书客\项目\天琊映雪无限画布'
PATHS = ['web/src/pages/create/index.tsx',
         'web/test/create-canvas-handoff.test.ts',
         'web/src/pages/canvas/project.tsx',
         'web/src/pages/canvas/use-canvas-assistant-visibility.ts',
         'web/src/pages/create/creation-types.ts']


def norm(b):
    return b.replace(b'\r\n', b'\n').decode('utf-8', 'surrogateescape')


for p in PATHS:
    f = Path(MAIN) / p
    if not f.exists():
        print('### %s  (missing in main tree)' % p)
        continue
    w = norm(f.read_bytes())
    h = norm(subprocess.run(['git', 'show', 'HEAD:' + p], capture_output=True).stdout)
    print('#' * 95)
    print('### %s   mainWork=%d  intHEAD=%d' % (p, len(w), len(h)))
    if w == h:
        print('    identical')
        continue
    d = list(difflib.unified_diff(h.split('\n'), w.split('\n'), 'intHEAD', 'mainWORK', lineterm='', n=1))
    sink = Path('.local/cache/_mvh_' + p.replace('/', '_') + '.diff')
    sink.write_text('\n'.join(d), encoding='utf-8')
    print('    diff lines=%d -> %s' % (len(d), sink))
    for l in d[:120]:
        print('    ' + l)
