import subprocess
from pathlib import Path
def ls(ref,path):
    return set(subprocess.run(['git','ls-tree','-r','--name-only',ref,path],capture_output=True,text=True,encoding='utf-8').stdout.splitlines())
for scope in ['backend', 'web']:
    b=ls('01a2d171',scope); h=ls('HEAD',scope); m=ls('b9d60f98',scope)
    yingxue_new = sorted(h-b)                  # 映雪新增
    upstream_deleted = sorted((b & h) - m)     # 上游删除（映雪有）
    upstream_new = sorted(m-h)
    print('#####', scope, '映雪新增=%d 上游删除(映雪有)=%d 上游新增=%d' % (len(yingxue_new), len(upstream_deleted), len(upstream_new)))
    print('--- 映雪新增 (HEAD-only vs base):')
    for x in yingxue_new:
        print('   ', 'DISK' if Path(x).exists() else 'GONE', x)
    print('--- 上游删除但映雪有 (b&h-m):')
    for x in upstream_deleted[:80]:
        print('   ', 'DISK' if Path(x).exists() else 'GONE', x)
    print('   ...total', len(upstream_deleted))
