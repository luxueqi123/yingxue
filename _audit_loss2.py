"""Same audit as _audit_loss.py but normalizing CRLF/LF so that git's
autocrlf rewriting is not mistaken for a content change."""

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


def cat(sha):
    if sha is None:
        return None
    raw = subprocess.run(['git', 'cat-file', 'blob', sha], capture_output=True).stdout
    return raw.replace(b'\r\n', b'\n')


base_tree, ours_tree, theirs_tree = ls_tree(BASE), ls_tree('HEAD'), ls_tree('MERGE_HEAD')

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

cache = {}


def blob(sha):
    if sha not in cache:
        cache[sha] = cat(sha)
    return cache[sha]


counts = Counter()
flags = []
for p in sorted(set(staged) | set(conflicted)):
    if p in conflicted:
        counts['CONFLICT'] += 1
        continue
    b, o, t, m = base_tree.get(p), ours_tree.get(p), theirs_tree.get(p), staged.get(p)
    B, O, T, M = blob(b), blob(o), blob(t), blob(m)
    ours_changed = O != B
    theirs_changed = T != B
    if not ours_changed and not theirs_changed:
        counts['no-change'] += 1
    elif ours_changed and not theirs_changed:
        counts['ours-only-kept' if M == O else 'ours-only-MUTATED'] += 1
        if M != O:
            flags.append(('OURS_ONLY_MUTATED', p))
    elif theirs_changed and not ours_changed:
        counts['theirs-only-applied' if M == T else 'theirs-only-MUTATED'] += 1
        if M != T:
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
