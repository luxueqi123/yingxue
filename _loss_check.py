"""Report 映雪 symbols that vanished from create/index.tsx after the merge."""

import re
import subprocess
from pathlib import Path

P = 'web/src/pages/create/index.tsx'
HEAD = subprocess.run(['git', 'show', 'HEAD:' + P], capture_output=True).stdout.decode('utf-8').replace('\r\n', '\n')
W = Path(P).read_text(encoding='utf-8')

decl = re.compile(r'^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|type|interface|class)\s+([A-Za-z_$][\w$]*)')
head_syms = [m.group(1) for m in (decl.match(l) for l in HEAD.split('\n')) if m]
work_syms = {m.group(1) for m in (decl.match(l) for l in W.split('\n')) if m}

imported = set()
for l in W.split('\n'):
    if l.startswith('import '):
        body = l[l.find('{') + 1:l.rfind('}')] if '{' in l else ''
        for part in body.split(','):
            part = part.strip()
            if not part:
                continue
            imported.add(part.split(' as ')[-1].replace('type ', '').strip())

missing = [s for s in dict.fromkeys(head_syms) if s not in work_syms and s not in imported]
unused_local = [s for s in sorted(work_syms) if len(re.findall(r'\b' + re.escape(s) + r'\b', W)) < 2]

print('## 映雪 index.tsx declarations that are now neither declared nor imported (%d)' % len(missing))
for s in missing:
    print('   %-38s used_in_head=%d' % (s, len(re.findall(r'\b' + re.escape(s) + r'\b', HEAD))))

print()
print('## local declarations now unused in the merged worktree (%d)' % len(unused_local))
for s in unused_local:
    print('   ' + s)
