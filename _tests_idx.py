import re
from pathlib import Path

root = Path('web/test')
files = sorted(list(root.rglob('*.test.ts')) + list(root.rglob('*.test.tsx')))
print('test files:', len(files))

targets = ['pages/create/index', 'create/index.tsx', 'createSource', 'readCreateSource']
for f in files:
    t = f.read_text(encoding='utf-8', errors='replace')
    if any(k in t for k in targets):
        print()
        print('########## ' + str(f))
        lines = t.split('\n')
        for i, l in enumerate(lines, 1):
            if any(k in l for k in ('create/index', 'readCreateSource', 'CreateSource(')):
                print('   %4d| %s' % (i, l.strip()[:150]))
        # print expect() lines that reference source
        for i, l in enumerate(lines, 1):
            s = l.strip()
            if s.startswith('expect(source)') or s.startswith('expect(createSource)') or s.startswith('expect(sourceCode)'):
                print('    E %4d| %s' % (i, s[:160]))
