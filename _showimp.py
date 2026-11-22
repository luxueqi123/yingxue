import re, sys
from pathlib import Path
files = sys.argv[1:]
for f in files:
    t = Path(f).read_text(encoding='utf-8')
    print('=====', f)
    for i, l in enumerate(t.split('\n'), 1):
        if 'canvas-agent-' in l or 'use-canvas-agent-operations' in l:
            print('  %4d %s' % (i, l.strip()))
