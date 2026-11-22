"""Approximate brace/paren depth tracker that skips strings, template literals,
line comments and block comments, to locate an unbalanced block."""

import re
from pathlib import Path

P = Path('web/src/pages/create/index.tsx')
src = P.read_text(encoding='utf-8')

depth_curly = 0
depth_paren = 0
i = 0
line = 1
state = None          # None | 'line' | 'block' | '"' | "'" | '`'
report = []
while i < len(src):
    c = src[i]
    nxt = src[i + 1] if i + 1 < len(src) else ''
    if c == '\n':
        line += 1
        if state == 'line':
            state = None
    if state is None:
        if c == '/' and nxt == '/':
            state = 'line'
            i += 2
            continue
        if c == '/' and nxt == '*':
            state = 'block'
            i += 2
            continue
        if c in '"\'':
            state = c
            i += 1
            continue
        if c == '`':
            state = '`'
            i += 1
            continue
        if c == '{':
            depth_curly += 1
        elif c == '}':
            depth_curly -= 1
        elif c == '(':
            depth_paren += 1
        elif c == ')':
            depth_paren -= 1
        i += 1
        continue
    if state == 'block':
        if c == '*' and nxt == '/':
            state = None
            i += 2
            continue
        i += 1
        continue
    if state == '`':
        if c == '\\':
            i += 2
            continue
        if c == '`':
            state = None
        i += 1
        continue
    # state is a quote
    if c == '\\':
        i += 2
        continue
    if c == state:
        state = None
    i += 1

print('final curly depth =', depth_curly, ' paren depth =', depth_paren)

# per-line rolling depth to locate the last line where depth returns to 0
lines = src.split('\n')
d = 0
last_zero = None
for idx, l in enumerate(lines, 1):
    d += l.count('{') - l.count('}')
    if d == 0:
        last_zero = idx
print('last line where naive depth == 0 :', last_zero, 'of', len(lines))
