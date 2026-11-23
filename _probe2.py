import re
import subprocess
from pathlib import Path

BASE = '01a2d171f5b2a6854a987ba2022a8d960d9107b4'
IDX = 'web/src/pages/create/index.tsx'

W = Path(IDX).read_text(encoding='utf-8').split('\n')


def body(ref, p):
    r = subprocess.run(['git', 'show', ref + ':' + p], capture_output=True)
    return r.stdout.decode('utf-8') if r.returncode == 0 else ''


print('## (a) whole-worktree occurrences')
wt = '\n'.join(W)
for k in ['writeComposerPref', 'readComposerPref', 'TEXT_STREAMING_PREF_KEY', 'textStreaming',
          'composerPreferencesHydrated', 'composerPreferencesInitialized', 'initialComposerPreferences',
          'rememberMode', 'rememberImageSettings', 'defaultCreationMode', 'useCreationPreferencesStore',
          'openingCanvas', 'useNavigate', 'skillRuntime', 'loadCreationRuntime', 'creationShotRail',
          'creationVideoShotOrdinal', 'CreationShotRailEntry', 'reconcileCreationAttachmentLimit',
          'removeCreationAttachment', 'replaceCreationAttachmentReference', 'brandName', 'submitGateRef',
          'createCreationSubmitGate', 'launchpadCondensed', 'launchpadRef', 'referenceReplacementBusy',
          'AnimatePresence', 'useReducedMotion', 'motion.', 'cn(', 'generationActive', 'textThinking']:
    print('   %-34s %d' % (k, wt.count(k)))

print()
print('## (b) creation-runtime.ts exports')
rt = Path('web/src/pages/create/creation-runtime.ts').read_text(encoding='utf-8')
print('   WORK len', len(rt), 'skillRuntime' in rt, 'subscribeGenerationTasks' in rt)
for ref in ['HEAD', 'MERGE_HEAD']:
    t = body(ref, 'web/src/pages/create/creation-runtime.ts')
    print('   %-10s len=%d skillRuntime=%s' % (ref, len(t), 'skillRuntime' in t))

print()
print('## (c) creation-conversations.ts exports (WORK)')
cc = Path('web/src/pages/create/creation-conversations.ts').read_text(encoding='utf-8')
for n in ['newConversation', 'newMessage', 'shotsFromMessages', 'creationShotRail', 'creationVideoShotOrdinal',
          'isImageAttachment', 'isVideoAttachment', 'conversationTimestamp', 'attachCreationTaskContexts']:
    print('   %-34s decl=%s' % (n, bool(re.search(r'export\s+(?:async\s+)?(?:function|const)\s+' + n + r'\b', cc))))

print()
print('## (d) uses of skillRuntime in MERGE_HEAD index + BASE index')
for ref in [BASE, 'HEAD', 'MERGE_HEAD']:
    t = body(ref, IDX)
    for m in re.finditer(r'skillRuntime[^\n]*', t):
        print('   %s | %s' % (ref[:9], m.group(0)[:130]))
