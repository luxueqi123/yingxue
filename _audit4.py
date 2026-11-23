"""Fast, precise silent-loss audit using index-vs-ref name lists."""

import subprocess
from collections import Counter

BASE = subprocess.run(['git', 'merge-base', 'HEAD', 'MERGE_HEAD'], capture_output=True).stdout.decode().strip()


def names(*args):
    return set(subprocess.run(['git', 'diff', '--cached', '--name-only', '-z', *args],
                              capture_output=True).stdout.decode('utf-8', 'surrogateescape').split('\x00')) - {''}


vs_head = names('HEAD')          # index != HEAD
vs_theirs = names('MERGE_HEAD')  # index != MERGE_HEAD
vs_base = names(BASE)            # index != base

conf = set(subprocess.run(['git', 'diff', '--name-only', '--diff-filter=U', '-z'],
                          capture_output=True).stdout.decode('utf-8', 'surrogateescape').split('\x00')) - {''}

print('index!=HEAD  :', len(vs_head))
print('index!=MERGE :', len(vs_theirs))
print('index!=base  :', len(vs_base))
print('conflicted   :', len(conf))
print()

c = Counter()
took_ours, took_theirs, merged = [], [], []
for p in sorted(vs_base):
    if p in conf:
        c['CONFLICT'] += 1
        continue
    dh, dt = p in vs_head, p in vs_theirs
    if not dh and not dt:
        c['index==HEAD==MERGE (both changed identically)'] += 1
    elif dh and not dt:
        c['took THEIRS'] += 1
        took_theirs.append(p)
    elif dt and not dh:
        c['took OURS'] += 1
        took_ours.append(p)
    else:
        c['BOTH->resolved/merged'] += 1
        merged.append(p)

for k, v in c.most_common():
    print('   %-46s %d' % (k, v))

print()
print('## took OURS (upstream change may have been dropped) -> need review')
for p in took_ours:
    print('   ' + p)

print()
print('## took THEIRS (映雪 change may have been dropped) -> need review')
for p in took_theirs:
    print('   ' + p)
