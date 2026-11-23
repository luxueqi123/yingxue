import re
from pathlib import Path

P = 'web/src/pages/create/creation-workspace.tsx'
T = Path(P).read_text(encoding='utf-8')
L = T.split('\n')

for n in ['CreationModeTabs', 'CreationFeaturedWorks', 'CreationEmptySuggest', 'CreationComposer',
          'CreationAgentEntry', 'CreationEmptyBanner', 'CreationWorkspaceToolbar', 'CreationHistoryDrawer',
          'CreationMessageView', 'creationAssetCategoryLabels', 'CreationViewSwitch', 'ModePicker']:
    for i, l in enumerate(L, 1):
        if re.search(r'export\s+(?:async\s+)?(?:function|const|type)\s+' + n + r'\b', l):
            print('%5d| %s' % (i, l[:400]))
    hits = [i for i, l in enumerate(L, 1) if re.search(r'\b' + n + r'\b', l)]
    print('      %s hits=%s' % (n, hits[:8]))
    print()

print('### creation-agent-entry.tsx')
print(Path('web/src/pages/create/creation-agent-entry.tsx').read_text(encoding='utf-8')[:1200])

print()
print('### creation-submit-gate.ts')
print(Path('web/src/pages/create/creation-submit-gate.ts').read_text(encoding='utf-8')[:1600])
