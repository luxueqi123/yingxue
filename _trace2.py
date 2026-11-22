"""Naive per-line brace counter that flags top-level declarations whose body
does not return to depth 0, which pinpoints a structurally broken block."""

import re
import sys
from pathlib import Path

path = sys.argv[1]
lines = Path(path).read_text(encoding='utf-8').split('\n')

TOP = re.compile(r'^(function|export function|export default function|export type|type|const|export const|async function|export async function)\b')

i = 0
depth = 0
while i < len(lines):
    l = lines[i]
    if depth == 0 and TOP.match(l):
        start = i
        d = 0
        j = i
        while j < len(lines):
            d += lines[j].count('{') - lines[j].count('}')
            if d <= 0 and j > start:
                break
            j += 1
        if j >= len(lines) or d != 0:
            print('BROKEN at line %d: %s' % (start + 1, l[:90]))
            print('   block ends at line %d with depth %d' % (j + 1, d))
            for k in range(max(start, j - 6), min(len(lines), j + 3)):
                print('     %5d| %s' % (k + 1, lines[k][:130]))
            break
        i = j + 1
        continue
    depth += l.count('{') - l.count('}')
    i += 1
else:
    print('all top-level blocks balanced (naive count)')
