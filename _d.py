import difflib, sys
from pathlib import Path
a, b = sys.argv[1], sys.argv[2]
A = Path(a).read_text(encoding="utf-8").splitlines()
B = Path(b).read_text(encoding="utf-8").splitlines()
for line in difflib.unified_diff(A, B, fromfile=a, tofile=b, lineterm="", n=1):
    print(line)
