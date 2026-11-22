"""Fast silent-loss audit using git cat-file --batch."""

import subprocess
import sys
from collections import Counter

BASE = subprocess.run(['git', 'merge-base', 'HEAD', 'MERGE_HEAD'], capture_output=True).stdout.decode().strip()


def ls_tree(ref):
    out = subprocess.run(['git', 'ls-tree', '-r', '-z', ref], capture_output=True).stdout
    d = {}
    for chunk in out.split(b'\x00'):
        if not chunk:
            continue
        meta, _, path = chunk.partition(b'\t')
        _mode, _typ, sha = meta.split()
        d[path.decode('utf-8', 'surrogateescape')] = sha.decode()
    return d


base_tree, ours_tree, theirs_tree = ls_tree(BASE), ls_tree('HEAD'), ls_tree('MERGE_HEAD')

staged, conflicted = {}, {}
out = subprocess.run(['git', 'ls-files', '-s', '-z'], capture_output=True).stdout
for chunk in out.split(b'\x00'):
    if not chunk:
        continue
    meta, _, path = chunk.partition(b'\t')
    _mode, sha, stage = meta.split()
    p = path.decode('utf-8', 'surrogateescape')
    if stage == b'0':
        staged[p] = sha.decode()
    else:
        conflicted.setdefault(p, set()).add(stage.decode())

wanted = set()
for p in list(staged) + list(conflicted):
    for tree in (base_tree, ours_tree, theirs_tree):
        s = tree.get(p)
        if s:
            wanted.add(s)
    if p in staged:
        wanted.add(staged[p])

wanted = sorted(wanted)
proc = subprocess.Popen(['git', 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
blobs = {}
i = 0
while i < len(wanted):
    batch = wanted[i:i + 500]
    payload = ('\n'.join(batch) + '\n').encode()
    proc.stdin.write(payload)
    proc.stdin.flush()
    for sha in batch:
        header = proc.stdout.readline().decode().strip()
        parts = header.split()
        size = int(parts[2])
        data = proc.stdout.read(size)
        proc.stdout.read(1)
        blobs[sha] = data.replace(b'\r\n', b'\n')
    i += 500
proc.stdin.close()
proc.wait()

print('blobs cached:', len(blobs), file=sys.stderr)

counts = Counter()
flags = []
for p in sorted(set(staged) | set(conflicted)):
    if p in conflicted:
        counts['CONFLICT'] += 1
        continue
    B = blobs.get(base_tree.get(p) or '')
    O = blobs.get(ours_tree.get(p) or '')
    T = blobs.get(theirs_tree.get(p) or '')
    M = blobs.get(staged.get(p) or '')
    oc, tc = O != B, T != B
    if not oc and not tc:
        counts['no-change'] += 1
    elif oc and not tc:
        if M == O:
            counts['ours-only-kept'] += 1
        else:
            counts['ours-only-MUTATED'] += 1
            flags.append(('OURS_ONLY_MUTATED', p))
    elif tc and not oc:
        if M == T:
            counts['theirs-only-applied'] += 1
        else:
            counts['theirs-only-MUTATED'] += 1
            flags.append(('THEIRS_ONLY_MUTATED', p))
    else:
        if M == O:
            counts['BOTH-took-OURS'] += 1
            flags.append(('BOTH_TOOK_OURS', p))
        elif M == T:
            counts['BOTH-took-THEIRS'] += 1
            flags.append(('BOTH_TOOK_THEIRS', p))
        else:
            counts['BOTH-merged'] += 1

print('## classification (CRLF-normalized)')
for k, v in counts.most_common():
    print('   %-24s %d' % (k, v))
print()
print('## flagged')
for kind, p in flags:
    print('   %-20s %s' % (kind, p))
