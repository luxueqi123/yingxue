import re
import subprocess
from pathlib import Path

P = 'web/src/pages/create/index.tsx'
cands = ['isVideoAttachment', 'isImageAttachment', 'conversationTimestamp', 'newConversation',
         'newMessage', 'attachCreationTaskContexts', 'materializeCreationTaskResults',
         'reconcileCreationTaskMessages', 'completedCreationGenerationTask', 'shotsFromMessages',
         'modeLabels', 'shotScriptLabels', 'ratioOptions', 'qualityOptions', 'resolutionOptions',
         'countOptions', 'conversationTimeFormatter', 'messageTimeFormatter',
         'creationAssetCategoryLabels', 'CreationComposer', 'CreationEmptySuggest',
         'CreationEmptyBanner', 'CreationHistoryDrawer', 'CreationMessageView',
         'CreationWorkspaceToolbar', 'creationEmptyBannerFrames', 'creationEmptySuggestions',
         'videoResolutionLabel', 'formatMessageTime', 'ratioPreviewStyle', 'blobToDataUrl']


def lines(ref):
    if ref == 'WORK':
        return Path(P).read_text(encoding='utf-8').split('\n')
    return subprocess.run(['git', 'show', ref + ':' + P], capture_output=True).stdout.decode('utf-8').replace('\r\n', '\n').split('\n')


decl = re.compile(r'^(?:export\s+)?(?:async\s+)?(?:function|const|let|type|interface)\s+([A-Za-z_$][\w$]*)')
for ref in ['HEAD', 'MERGE_HEAD', 'WORK']:
    S = lines(ref)
    d = {}
    for i, l in enumerate(S, 1):
        m = decl.match(l)
        if m:
            d.setdefault(m.group(1), []).append(i)
    print('=== ' + ref, 'decls=', len(d))
    for c in cands:
        if c in d:
            print('    %-34s decl@%s' % (c, d[c]))
    print('    ---------- names declared in index.tsx:', ' '.join(sorted(d.keys())))
