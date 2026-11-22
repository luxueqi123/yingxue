import subprocess
from pathlib import Path

PATHS = [
    'web/src/pages/create/index.tsx',
    'web/src/pages/create/creation-workspace.tsx',
    'web/src/pages/create/creation-types.ts',
    'web/src/pages/create/creation-conversations.ts',
    'web/src/pages/create/creation-assets.ts',
    'web/src/pages/create/creation-references.ts',
    'web/src/pages/create/creation-input-policy.ts',
    'web/src/pages/create/creation-runtime.ts',
    'web/test/create-canvas-handoff.test.ts',
    'web/test/create-library-button.test.ts',
    'web/test/canvas-resource-mention-editor.test.ts',
    'web/test/workspace-route-loading.test.ts',
    'web/test/canvas-angle-dialog.test.ts',
    'web/test/canvas-node-drag-overlays.test.ts',
    'web/test/skill-runtime.test.ts',
    'web/test/generation-task-local.test.ts',
    'web/test/ltv-submission-guards.test.ts',
    'web/test/scrollbar-style-source.test.ts',
]


def blob(ref, p):
    r = subprocess.run(['git', 'show', ref + ':' + p], capture_output=True)
    return r.stdout if r.returncode == 0 else None


def norm(b):
    return None if b is None else b.replace(b'\r\n', b'\n')


print('%-52s %8s %8s %8s %6s %6s' % ('path', 'HEAD', 'MERGE', 'WORK', '=H?', '=M?'))
for p in PATHS:
    h, m = norm(blob('HEAD', p)), norm(blob('MERGE_HEAD', p))
    f = Path(p)
    w = norm(f.read_bytes()) if f.exists() else None
    print('%-52s %8s %8s %8s %6s %6s' % (p.split('/')[-1], len(h or b''), len(m or b''), len(w or b''), h == w, m == w))
