import re, sys
from pathlib import Path
pats = sys.argv[1:]
root = Path('web/src')
files = [p for p in root.rglob('*') if p.suffix in ('.ts', '.tsx', '.css', '.json')]
root2 = Path('web/test')
files += [p for p in root2.rglob('*') if p.suffix in ('.ts', '.tsx')]
for pat in pats:
    rx = re.compile(re.escape(pat))
    print('=== ' + pat)
    n = 0
    for p in files:
        t = p.read_text(encoding='utf-8', errors='replace')
        c = len(rx.findall(t))
        if c:
            n += c
            print('   %-95s %d' % (str(p).replace('\\', '/'), c))
    print('   total', n)
