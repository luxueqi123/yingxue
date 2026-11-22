import subprocess
from pathlib import Path
def ls(ref,path):
    return set(subprocess.run(['git','ls-tree','-r','--name-only',ref,path],capture_output=True,text=True,encoding='utf-8').stdout.splitlines())
h=ls('HEAD','backend'); m=ls('b9d60f98','backend')
ho=sorted(h-m); mo=sorted(m-h)
print('=== HEAD-only backend (%d)'%len(ho))
for x in ho: print('  ',x, 'DISK' if Path(x).exists() else 'GONE')
print('=== MERGE-only backend (%d)'%len(mo))
for x in mo: print('  ',x, 'DISK' if Path(x).exists() else 'GONE')
