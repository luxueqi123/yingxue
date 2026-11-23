"""Audit the in-progress merge result for silent loss of the 映雪 (ours) side.

For every tracked path, compare:
    base   = merge-base blob      (git ls-tree <base>)
    ours   = HEAD blob
    theirs = MERGE_HEAD blob
    merged = stage-0 blob         (the working merge result)

Classification:
    merged == ours  and ours != theirs   -> took ours   (no upstream change lost)
    merged == theirs and theirs != ours  -> took theirs (upstream)
    merged != ours and merged != theirs  -> real merge
"""

import subprocess
from collections import Counter, defaultdict

BASE = subprocess.run(['git', 'merge-base', 'HEAD', 'MERGE_HEAD'], capture_output=True).stdout.decode().strip()


def ls_tree(ref):
    out = subprocess.run(['git', 'ls-tree', '-r', '-z', ref], capture_output=True).stdout
    d = {}
    for chunk in out.split(b'\x00'):
        if not chunk:
            continue
        meta, _, path = chunk.partition(b'\t')
        mode, typ, sha = meta.split()
        d[path.decode('utf-8', 'surrogateescape')] = sha.decode()
    return d


base_tree = ls_tree(BASE)
ours_tree = ls_tree('HEAD')
theirs_tree = ls_tree('MERGE_HEAD')

staged = {}
out = subprocess.run(['git', 'ls-files', '-s', '-z'], capture_output=True).stdout
conflicted = defaultdict(set)
for chunk in out.split(b'\x00'):
    if not chunk:
        continue
    meta, _, path = chunk.partition(b'\t')
    mode, sha, stage = meta.split()
    p = path.decode('utf-8', 'surrogateescape')
    if stage == b'0':
        staged[p] = sha.decode()
    else:
        conflicted[p].add(stage.decode())

print('BASE =', BASE, ' base paths =', len(base_tree))
print('ours paths =', len(ours_tree), ' theirs paths =', len(theirs_tree), ' staged paths =', len(staged))
print('conflicted paths =', len(conflicted))
print()

counts = Counter()
flags = []

allpaths = set(staged) | set(conflicted)
for p in sorted(allpaths):
    o = ours_tree.get(p)
    t = theirs_tree.get(p)
    b = base_tree.get(p)
    m = staged.get(p)

    if p in conflicted:
        counts['CONFLICT'] += 1
        flags.append(('CONFLICT', p))
        continue

    ours_changed = o != b
    theirs_changed = t != b
    if not ours_changed and not theirs_changed:
        counts['no-change'] += 1
    elif ours_changed and not theirs_changed:
        if m == o:
            counts['ours-only-kept'] += 1
        else:
            counts['ours-only-MUTATED'] += 1
            flags.append(('OURS_ONLY_MUTATED', p))
    elif theirs_changed and not ours_changed:
        if m == t:
            counts['theirs-only-applied'] += 1
        else:
            counts['theirs-only-MUTATED'] += 1
            flags.append(('THEIRS_ONLY_MUTATED', p))
    else:
        if m == o:
            counts['BOTH-took-OURS'] += 1
            flags.append(('BOTH_TOOK_OURS', p))
        elif m == t:
            counts['BOTH-took-THEIRS'] += 1
            flags.append(('BOTH_TOOK_THEIRS', p))
        else:
            counts['BOTH-merged'] += 1

print('## classification')
for k, v in counts.most_common():
    print('   %-24s %d' % (k, v))

print()
print('## flagged (need human review)')
for kind, p in flags:
    head = repr(p)
    print('   %-20s %s' % (kind, head))
