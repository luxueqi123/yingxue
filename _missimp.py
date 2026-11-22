import re
from pathlib import Path
root = Path('web/src')
files = [p for p in root.rglob('*') if p.suffix in ('.ts', '.tsx')]
imp = re.compile(r'''from\s+["']([^"']+)["']''')
miss = {}
for p in files:
    t = p.read_text(encoding='utf-8', errors='replace')
    for m in imp.finditer(t):
        spec = m.group(1)
        if spec.startswith('@/'):
            base = Path('web/src') / spec[2:]
            cands = [base.with_suffix('.ts'), base.with_suffix('.tsx'), base / 'index.ts', base / 'index.tsx']
            if not any(c.exists() for c in cands):
                miss.setdefault(spec, []).append(str(p).replace('\\', '/'))
for spec in sorted(miss):
    print(spec, '<-', len(miss[spec]), miss[spec][:4])
print('total missing specs', len(miss))
