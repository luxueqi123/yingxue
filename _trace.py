"""String/comment-aware brace tracker that reports, for every top-level
statement, the line where its brace depth returns to zero."""

import sys
from pathlib import Path


def trace(path):
    src = Path(path).read_text(encoding='utf-8')
    depth = 0
    paren = 0
    line = 1
    state = None
    zeros = []
    i = 0
    while i < len(src):
        c = src[i]
        nxt = src[i + 1] if i + 1 < len(src) else ''
        if c == '\n':
            line += 1
            if state == 'line':
                state = None
            if depth == 0 and paren == 0:
                zeros.append(line)
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
                depth += 1
            elif c == '}':
                depth -= 1
            elif c == '(':
                paren += 1
            elif c == ')':
                paren -= 1
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
        if c == '\\':
            i += 2
            continue
        if c == state:
            state = None
        i += 1
    return depth, paren, zeros


path = sys.argv[1]
d, p, zeros = trace(path)
total = len(Path(path).read_text(encoding='utf-8').split('\n'))
print('%s: final curly=%d paren=%d lines=%d' % (path, d, p, total))
print('last 15 depth-0 lines:', zeros[-15:])
