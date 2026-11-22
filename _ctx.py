import re
from pathlib import Path

P = 'web/src/pages/create/index.tsx'
L = Path(P).read_text(encoding='utf-8').split('\n')

print('total lines', len(L))

# blocks
blocks = []
i = 0
while i < len(L):
    if L[i].startswith('<<<<<<<'):
        d = 1
        j = i + 1
        mid = None
        while j < len(L):
            if L[j].startswith('<<<<<<<'):
                d += 1
            elif L[j].startswith('>>>>>>>'):
                d -= 1
                if d == 0:
                    break
            elif L[j] == '=======' and d == 1 and mid is None:
                mid = j
            j += 1
        blocks.append((i, mid, j))
        i = j + 1
    else:
        i += 1

out = []
for k, (a, mid, b) in enumerate(blocks, 1):
    out.append('########## BLOCK %d  worktree %d-%d  (ours %d lines, theirs %d lines)' % (k, a + 1, b + 1, mid - a - 1, b - mid - 1))
    out.append('--- context BEFORE (5) ---')
    for x in range(max(0, a - 5), a):
        out.append('  %5d| %s' % (x + 1, L[x]))
    out.append('--- OURS (%d-%d) ---' % (a + 2, mid))
    for x in range(a + 1, mid):
        out.append('  %5d| %s' % (x + 1, L[x]))
    out.append('--- THEIRS (%d-%d) ---' % (mid + 2, b))
    for x in range(mid + 1, b):
        out.append('  %5d| %s' % (x + 1, L[x]))
    out.append('--- context AFTER (8) ---')
    for x in range(b + 1, min(len(L), b + 9)):
        out.append('  %5d| %s' % (x + 1, L[x]))
    out.append('')

Path('_ctx_all.txt').write_text('\n'.join(out), encoding='utf-8')
print('blocks', len(blocks), '-> _ctx_all.txt')

print()
print('## upstream-page-feature scan in worktree')
for k in ['recoveryTaskKey', 'videoShots', 'jumpToShot', 'activeGenerationTaskIdsRef', 'loadAddedSkills',
          'addedSkillsRequestedRef', 'promptRef', 'attachmentsRef', 'openingCanvas', 'rememberMode',
          'rememberImageSettings', 'setComposerRatio', 'submitGateRef', 'reducedMotion', 'launchpadCondensed',
          'creationShotRail', 'videoResolutionLabel', 'writeComposerPref']:
    hits = [x + 1 for x, l in enumerate(L) if k in l]
    print('   %-30s %s' % (k, hits[:8]))
