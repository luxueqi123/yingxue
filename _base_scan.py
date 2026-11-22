import re
import subprocess
from pathlib import Path

P = 'web/src/pages/create/index.tsx'


def lines(ref):
    out = subprocess.run(['git', 'show', ref + ':' + P], capture_output=True).stdout
    return out.decode('utf-8').replace('\r\n', '\n').split('\n')


base = subprocess.run(['git', 'merge-base', 'HEAD', 'MERGE_HEAD'], capture_output=True).stdout.decode().strip()
print('merge-base', base)
B = lines(base)
print('base lines', len(B))
for i, l in enumerate(B, 1):
    if './creation-' in l and l.lstrip().startswith('import'):
        print('  imp %d| %s' % (i, l[:160]))
names = ['function CreationComposer', 'function CreationEmptySuggest', 'function CreationEmptyBanner',
         'function CreationHistoryDrawer', 'function CreationMessageView', 'function CreationWorkspaceToolbar',
         'const creationAssetCategoryLabels', 'function CreationModeTabs', 'function CreationFeaturedWorks']
for n in names:
    hits = [i for i, l in enumerate(B, 1) if n in l]
    print('  %-40s %s' % (n, hits[:5]))
