import os
import subprocess
from pathlib import Path

MAIN = r'D:\天琊书客\项目\天琊映雪无限画布'
INT = r'D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912'


def sz(p):
    try:
        return os.path.getsize(p)
    except OSError:
        return -1


files = ['web/src/pages/create/index.tsx', 'web/src/pages/create/creation-workspace.tsx']
for f in files:
    print('## ' + f)
    print('   main-tree worktree : %d' % sz(os.path.join(MAIN, f)))
    print('   main-tree HEAD     : %d' % len(subprocess.run(['git', '-C', MAIN, 'show', 'HEAD:' + f], capture_output=True).stdout))
    print('   int-tree worktree  : %d' % sz(os.path.join(INT, f)))
    print('   int-tree HEAD      : %d' % len(subprocess.run(['git', '-C', INT, 'show', 'HEAD:' + f], capture_output=True).stdout))

print()
print('## main tree HEAD vs int-tree HEAD (identical bytes?)')
for f in files:
    a = subprocess.run(['git', '-C', MAIN, 'show', 'HEAD:' + f], capture_output=True).stdout
    b = subprocess.run(['git', '-C', INT, 'show', 'HEAD:' + f], capture_output=True).stdout
    print('   %s -> %s' % (f, a == b))

print()
print('## main tree worktree content probes on index.tsx')
p = os.path.join(MAIN, 'web/src/pages/create/index.tsx')
if os.path.exists(p):
    t = Path(p).read_text(encoding='utf-8', errors='replace')
    for k in ['import { CreationComposer', 'function CreationComposer', 'creation-workspace',
              'agentMode', 'creation-chat-intro', 'CreationEmptyBanner', 'creation-launchpad']:
        print('   %-32s %d' % (k, t.count(k)))
    print('   len', len(t))

print()
print('## main tree history for index.tsx (last 8)')
print(subprocess.run(['git', '-C', MAIN, 'log', '--oneline', '-8', '--', 'web/src/pages/create/index.tsx'], capture_output=True).stdout.decode('utf-8', 'replace'))
print('## main tree log -1 for creation-workspace.tsx')
print(subprocess.run(['git', '-C', MAIN, 'log', '--oneline', '-3', '--', 'web/src/pages/create/creation-workspace.tsx'], capture_output=True).stdout.decode('utf-8', 'replace'))
