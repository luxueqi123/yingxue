import subprocess
from pathlib import Path
files = ['web/src/services/agent-capabilities.ts','web/src/stores/canvas/use-canvas-agent-store.ts','web/src/lib/canvas/canvas-project-documents.ts','web/src/components/canvas/canvas-agent-chat-ui.tsx','web/src/components/canvas/canvas-assistant-online-tools.ts','web/src/components/canvas/canvas-assistant-panel.tsx','web/src/components/canvas/canvas-cinematic-continuation.ts','web/src/components/canvas/canvas-local-agent-panel.tsx','web/src/pages/canvas/use-canvas-agent-operations.ts','web/test/agent-capabilities.test.ts','web/test/agent-storyboard.test.ts','web/test/canvas-project-documents.test.ts','web/test/project-document-persistence.test.ts','web/test/production-library.node.test.ts','web/test/canvas-assistant-creative.test.ts','web/test/generation-task-local.test.ts','web/test/generation-task-materializer.test.ts','web/src/pages/canvas/project.tsx','web/src/components/canvas/canvas-assistant-panel-views.tsx','web/src/components/canvas/canvas-agent-panel-chrome.tsx','web/src/pages/canvas/canvas-assistant-panel-column.tsx','web/src/lib/canvas/canvas-assistant-references.ts']
def blob(ref, p):
    r = subprocess.run(['git', 'rev-parse', ref + ':' + p], capture_output=True, text=True, encoding='utf-8')
    return r.stdout.strip() if r.returncode == 0 else None
idx = subprocess.run(['git', 'ls-files', '-s'] + files, capture_output=True, text=True, encoding='utf-8').stdout
idmap = {}
for line in idx.splitlines():
    meta, p = line.split('\t', 1)
    idmap[p] = (meta.split()[0], meta.split()[1])
for f in files:
    b = blob('01a2d171', f); h = blob('HEAD', f); m = blob('b9d60f98', f)
    st, i = idmap.get(f, ('??', '?'))
    marks = []
    if i == h: marks.append('idx=HEAD')
    if i == m: marks.append('idx=MERGE')
    if i == b: marks.append('idx=BASE')
    print('%-70s stage=%s base=%s head=%s merge=%s %s' % (f, st, 'Y' if b else '-', 'Y' if h else '-', 'Y' if m else '-', ','.join(marks)))
