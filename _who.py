import re
from pathlib import Path
old = ['canvas-agent-ops', 'canvas-agent-context-budget', 'canvas-agent-context', 'canvas-agent-storyboard', 'canvas-agent-workflow']
new = ['canvas-operation-contract', 'agent-context-budget', 'canvas-context-discovery', 'canvas-storyboard-operations', 'canvas-workflow-builder']
rx = re.compile(r'''from\s+["']([^"']+)["']''')
roots = [Path('web/src'), Path('web/test')]
files = []
for r in roots:
    files += [p for p in r.rglob('*') if p.suffix in ('.ts', '.tsx')]
print('--- OLD importers ---')
for p in files:
    t = p.read_text(encoding='utf-8', errors='replace')
    for m in rx.finditer(t):
        s = m.group(1)
        if any(s.endswith('/' + o) for o in old):
            line = t[:m.start()].count('\n') + 1
            print('%-75s :%d %s' % (str(p).replace('\\', '/'), line, s))
print('--- NEW importers ---')
for p in files:
    t = p.read_text(encoding='utf-8', errors='replace')
    for m in rx.finditer(t):
        s = m.group(1)
        if any(s.endswith('/' + o) for o in new):
            line = t[:m.start()].count('\n') + 1
            print('%-75s :%d %s' % (str(p).replace('\\', '/'), line, s))
