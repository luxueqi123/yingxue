import subprocess
from pathlib import Path

FEATS = ['agentIntent', 'agentMode', 'CreationAgentEntry', 'StoryboardToolbar', 'StoryboardShotCard',
         'creationCanvasHandoffPath', 'createCreationSubmitGate', 'submitGateRef', 'textStreaming',
         'textThinking', 'useCreationPreferencesStore', 'rememberMode', 'CreationModeTabs',
         'CreationFeaturedWorks', 'creationReferenceMetadata', 'skillRuntime', 'useCanvasCreationBrief',
         'CreationEntrySeed', 'embedded', 'creation-chat-dock', 'creation-submit-cost',
         'creation-reference-add-button', 'Reorder', 'LayoutGroup', 'useWorkspaceTopBarMount',
         'CreationEmptyBanner', 'creation-chat-intro', 'creation-launchpad', 'CreationEmptySuggest',
         'creationShotRail', 'creationVideoShotOrdinal', 'referenceReplacementBusy',
         'reconcileCreationAttachmentLimit', 'removeCreationAttachment', 'CreationUserMessage',
         'MediaResult', 'CreationMediaPending', 'ModePicker', 'GenerationSettingsMenu', 'DurationMenu',
         'CreationViewSwitch', 'creation-entry.css', 'CreationSkillPicker', 'uploadLibraryAssets',
         '个素材已上传到素材库并自动选中', '上传后保存到素材库', 'readingDocument', 'readCreationDocument']


def txt(ref, p):
    r = subprocess.run(['git', 'show', ref + ':' + p], capture_output=True)
    return r.stdout.decode('utf-8') if r.returncode == 0 else ''


idx_head = txt('HEAD', 'web/src/pages/create/index.tsx')
ws_head = txt('HEAD', 'web/src/pages/create/creation-workspace.tsx')
ws_work = Path('web/src/pages/create/creation-workspace.tsx').read_text(encoding='utf-8')
idx_work = Path('web/src/pages/create/index.tsx').read_text(encoding='utf-8')

print('%-38s %6s %6s %6s %6s' % ('feature', 'iHEAD', 'wsHEAD', 'wsWORK', 'iWORK'))
for f in FEATS:
    print('%-38s %6d %6d %6d %6d' % (f, idx_head.count(f), ws_head.count(f), ws_work.count(f), idx_work.count(f)))
