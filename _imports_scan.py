import re
from pathlib import Path

for tag, f in [('HEAD', '_c_head.tsx'), ('ORIG', '_c_orig.tsx'), ('WORK', 'web/src/pages/create/index.tsx')]:
    S = Path(f).read_text(encoding='utf-8').split('\n')
    print('=== ' + tag)
    for i, l in enumerate(S, 1):
        if './creation-' in l and l.lstrip().startswith('import'):
            print('  %d| %s' % (i, l[:170]))
