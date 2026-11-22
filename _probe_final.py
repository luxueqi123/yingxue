import re
import subprocess
from pathlib import Path

P = 'web/src/pages/create/index.tsx'


def git_show(ref, path):
    return subprocess.run(['git', 'show', ref + ':' + path], capture_output=True).stdout.decode('utf-8').replace('\r\n', '\n')


W = Path(P).read_text(encoding='utf-8').split('\n')
inblock = [False] * len(W)
i = 0
while i < len(W):
    if W[i].startswith('<<<<<<<'):
        d = 1
        j = i + 1
        while j < len(W):
            if W[j].startswith('<<<<<<<'):
                d += 1
            elif W[j].startswith('>>>>>>>'):
                d -= 1
                if d == 0:
                    break
            j += 1
        for k in range(i, j + 1):
            inblock[k] = True
        i = j + 1
    else:
        i += 1
plain = [l for k, l in enumerate(W) if not inblock[k]]
plaintext = '\n'.join(plain)

print('## plain usage in worktree (outside conflict blocks)')
for n in ['modeLabels', 'shotScriptLabels', 'ratioOptions', 'qualityOptions', 'resolutionOptions',
          'countOptions', 'conversationTimeFormatter', 'messageTimeFormatter', 'useNavigate', 'lazy(',
          'Suspense', 'brandName', 'useAppearanceStore', 'cn(', 'defaultCreationMode',
          'useCreationPreferencesStore', 'reconcileCreationAttachmentLimit',
          'replaceCreationAttachmentReference', 'removeCreationAttachment', 'creationShotRail',
          'creationVideoShotOrdinal', 'CreationShotRailEntry', 'skillRuntime', 'loadCreationRuntime',
          'createCreationSubmitGate', 'CreationModeTabs', 'CreationFeaturedWorks', 'CreationAgentEntry',
          'attachCreationTaskContexts', 'materializeCreationTaskResults', 'reconcileCreationTaskMessages',
          'isImageAttachment', 'isVideoAttachment', 'conversationTimestamp', 'newConversation', 'newMessage',
          'completedCreationGenerationTask', 'CreationEmptySuggest', 'CreationHistoryDrawer',
          'CreationMessageView', 'CreationWorkspaceToolbar', 'creationAssetCategoryLabels',
          'CreationEmptyBanner', 'CreationComposer']:
    c = len(re.findall(r'\b' + re.escape(n), plaintext))
    print('   %-38s %d' % (n, c))

print()
print('## HEAD local definitions in index.tsx')
H = Path('_c_head.tsx').read_text(encoding='utf-8').split('\n')
for n in ['modeLabels', 'shotScriptLabels', 'ratioOptions', 'qualityOptions', 'resolutionOptions',
          'countOptions', 'conversationTimeFormatter', 'messageTimeFormatter', 'type CreationMessage',
          'type CreationConversation', 'type CreationMode', 'type CreationStatus', 'type CreationSettings',
          'type CreationRetryContext', 'function newConversation', 'function newMessage']:
    hits = [i for i, l in enumerate(H, 1) if n in l]
    print('   %-32s %s' % (n, hits[:3]))

print()
print('## creation-types.ts: HEAD vs WORK')
ct_h = git_show('HEAD', 'web/src/pages/create/creation-types.ts')
ct_w = Path('web/src/pages/create/creation-types.ts').read_text(encoding='utf-8')
print('   equal:', ct_h == ct_w, len(ct_h), len(ct_w))

print()
print('## test file lines 140-170')
T = Path('web/test/create-library-button.test.ts').read_text(encoding='utf-8').split('\n')
for i in range(139, min(175, len(T))):
    print('   %d| %s' % (i + 1, T[i]))
