import subprocess, sys
ref = sys.argv[1]
needles = sys.argv[2:]
out = subprocess.run(['git', 'ls-tree', '-r', '--name-only', ref, 'web/src'], capture_output=True, text=True, encoding='utf-8').stdout.splitlines()
for p in out:
    if not p.endswith(('.ts', '.tsx')): continue
    r = subprocess.run(['git', 'cat-file', 'blob', '%s:%s' % (ref, p)], capture_output=True)
    try: t = r.stdout.decode('utf-8')
    except Exception: continue
    hits = [n for n in needles if n in t]
    if hits: print('%-70s %s' % (p, hits))
