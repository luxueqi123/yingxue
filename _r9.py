# -*- coding: utf-8 -*-
import io, re, sys

path = sys.argv[1] if len(sys.argv) > 1 else "web/test/skill-runtime.test.ts"
t = io.open(path, encoding="utf8").read().split("\n")
names = []
for i, l in enumerate(t):
    m = re.search(r'^\s*test\("([^"]+)"', l)
    if m:
        names.append((i + 1, m.group(1)))
for n in names:
    print(n[0], n[1])
