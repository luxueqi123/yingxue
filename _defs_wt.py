import re
from pathlib import Path

P = 'web/src/pages/create/index.tsx'
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

pat = re.compile(r'^(export\s+)?(declare\s+)?(default\s+)?(async\s+)?(function|const|let|var|type|interface|class|enum)\s+([A-Za-z_$][\w$]*)')
print('## top-level declarations (plain area only)')
for k, l in enumerate(W):
    if inblock[k]:
        continue
    m = pat.match(l)
    if m:
        print('   %5d | %s' % (k + 1, l[:110]))
