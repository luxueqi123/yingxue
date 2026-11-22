import subprocess
from pathlib import Path

WS = 'web/src/pages/create/creation-workspace.tsx'
IDX = 'web/src/pages/create/index.tsx'
KEYS = ['creation-chat-dock', 'Reorder.Group', 'onClick={props.onOpenLibrary}', 'creation-reference-add-button',
        'creation-submit-cost', 'ModePicker mode={props.mode}', 'useWorkspaceTopBarMount', 'createPortal(toolbar, mount)',
        'creation-user-message-attachments', 'CreationMediaPreviewModal url={previewUrl}', '<CreationEmptyBanner',
        'creation-home-heading', 'creation-launchpad', 'CreationModeTabs', 'CreationFeaturedWorks',
        'onOpenLibrary', 'creation-composer-mode-row', 'import "./creation-scrollbars.css"']


def show(ref, p):
    return subprocess.run(['git', 'show', ref + ':' + p], capture_output=True).stdout.decode('utf-8')


base = '01a2d171f5b2a6854a987ba2022a8d960d9107b4'
print('### creation-workspace.tsx')
for ref in [base, 'HEAD', 'MERGE_HEAD']:
    t = show(ref, WS)
    print('  --- ' + ref[:12] + ' len=%d' % len(t))
    for k in KEYS:
        if k in t:
            print('      %s = %d' % (k, t.count(k)))
print('  --- WORK len=%d' % len(Path(WS).read_text(encoding='utf-8')))
t = Path(WS).read_text(encoding='utf-8')
for k in KEYS:
    if k in t:
        print('      %s = %d' % (k, t.count(k)))

print()
print('### index.tsx')
for ref in [base, 'HEAD', 'MERGE_HEAD']:
    t = show(ref, IDX)
    print('  --- ' + ref[:12] + ' len=%d lines=%d' % (len(t), t.count('\n')))

print()
print('### git status of create dir + tests')
print(subprocess.run(['git', 'status', '--short', '--', 'web/src/pages/create', 'web/test'], capture_output=True).stdout.decode('utf-8'))
