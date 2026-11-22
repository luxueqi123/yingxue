import difflib
import subprocess
from pathlib import Path

P = 'web/src/pages/create/creation-workspace.tsx'
BASE = '01a2d171f5b2a6854a987ba2022a8d960d9107b4'


def txt(ref):
    return subprocess.run(['git', 'show', ref + ':' + P], capture_output=True).stdout.decode('utf-8').replace('\r\n', '\n').split('\n')


h, m = txt('HEAD'), txt('MERGE_HEAD')
out = list(difflib.unified_diff(h, m, 'HEAD', 'MERGE_HEAD', lineterm='', n=0))
print('diff lines:', len(out))
sink = Path('.local/cache/_ws_head_vs_merge.diff')
sink.write_text('\n'.join(out), encoding='utf-8')
print('written', sink)
# summary of removed vs added
rem = [l for l in out if l.startswith('-') and not l.startswith('---')]
add = [l for l in out if l.startswith('+') and not l.startswith('+++')]
print('removed %d added %d' % (len(rem), len(add)))
