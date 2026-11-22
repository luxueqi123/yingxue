import re
from pathlib import Path

L = Path('web/src/pages/create/index.tsx').read_text(encoding='utf-8').split('\n')


def dump(a, b, tag):
    print('=== %s  %d-%d' % (tag, a, b))
    for i in range(a - 1, min(b, len(L))):
        print('%5d| %s' % (i + 1, L[i]))


for k in ['creationReferenceMetadata', 'cn(', 'AssetLibraryPickerModal', 'metadata', 'skillReferences',
          'prepare(', 'loadCreationRuntime', 'submitGateRef', 'generationActive', 'textStreaming',
          'CreationModeTabs', 'CreationFeaturedWorks', 'CreationAgentEntry', 'createCreationSubmitGate',
          'useCreationPreferencesStore', 'defaultCreationMode', 'rememberMode', 'composerProps',
          'reconcileCreationAttachmentLimit', 'removeCreationAttachment', 'replaceCreationAttachmentReference']:
    hits = [i + 1 for i, l in enumerate(L) if k in l]
    print('%-36s %s' % (k, hits[:14]))

print()
dump(760, 812, 'B9 region')
