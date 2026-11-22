import re
import subprocess
from pathlib import Path

P = 'web/src/pages/create/creation-workspace.tsx'
NAMES = ['CreationComposer', 'CreationEmptyBanner', 'CreationEmptySuggest', 'CreationFeaturedWorks',
         'CreationHistoryDrawer', 'CreationMessageView', 'CreationModeTabs', 'CreationWorkspaceToolbar',
         'creationAssetCategoryLabels']


def text(ref):
    if ref == 'WORK':
        return Path(P).read_text(encoding='utf-8')
    return subprocess.run(['git', 'show', ref + ':' + P], capture_output=True).stdout.decode('utf-8')


for ref in ['HEAD', 'MERGE_HEAD', 'WORK']:
    t = text(ref)
    print('=== ' + ref, len(t))
    for n in NAMES:
        m = re.search(r'export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class)\s+' + n + r'\b', t)
        m2 = re.search(r'\b' + n + r'\b', t)
        print('   %-30s export=%s  present=%s' % (n, bool(m), bool(m2)))
