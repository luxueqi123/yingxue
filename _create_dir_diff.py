import difflib
import re
import subprocess
from pathlib import Path

BASE = '01a2d171f5b2a6854a987ba2022a8d960d9107b4'
DIR = 'web/src/pages/create/'
FILES = ['creation-assets.ts', 'creation-references.ts', 'creation-types.ts',
         'creation-conversations.ts', 'creation-runtime.ts', 'creation-input-policy.ts']


def txt(ref, p):
    r = subprocess.run(['git', 'show', ref + ':' + p], capture_output=True)
    return r.stdout.decode('utf-8').replace('\r\n', '\n') if r.returncode == 0 else ''


decl = re.compile(r'^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|type|interface|class)\s+([A-Za-z_$][\w$]*)')

for f in FILES:
    p = DIR + f
    o, t = txt('HEAD', p), txt('MERGE_HEAD', p)
    w = Path(p).read_text(encoding='utf-8').replace('\r\n', '\n')
    print('#' * 90)
    print('## %s   ours=%d theirs=%d work=%d   work==ours:%s work==theirs:%s' % (f, len(o), len(t), len(w), w == o, w == t))
    os_ = sorted({m.group(1) for m in (decl.match(l) for l in o.split('\n')) if m})
    ts_ = sorted({m.group(1) for m in (decl.match(l) for l in t.split('\n')) if m})
    print('   only-in-ours  :', [s for s in os_ if s not in ts_])
    print('   only-in-theirs:', [s for s in ts_ if s not in os_])
    if not t:
        print('   (upstream deleted this file -> 映雪 keep)')
        continue
    d = list(difflib.unified_diff(t.split('\n'), o.split('\n'), 'theirs', 'ours', lineterm='', n=0))
    adds = [l[1:] for l in d if l.startswith('+') and not l.startswith('+++')]
    rems = [l[1:] for l in d if l.startswith('-') and not l.startswith('---')]
    print('   ours-vs-theirs: +%d -%d lines' % (len(adds), len(rems)))
    Path('.local/cache/_cd_%s.diff' % f).write_text('\n'.join(d), encoding='utf-8')
    print('   diff -> .local/cache/_cd_%s.diff' % f)
