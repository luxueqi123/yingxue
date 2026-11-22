"""列出给定路径在 base/HEAD/ORIGIN/worktree 四处的存在与大小。

用法: python -X utf8 _tri_presence.py <path> [<path> ...]
"""

import os
import subprocess
import sys


def blob(ref: str, path: str) -> tuple[bool, int]:
    out = subprocess.run(["git", "show", f"{ref}:{path}"], capture_output=True)
    if out.returncode != 0:
        return False, 0
    return True, len(out.stdout)


def main() -> None:
    base = subprocess.run(["git", "merge-base", "HEAD", "MERGE_HEAD"], capture_output=True).stdout.decode().strip()[:8]
    print(f"merge-base={base}")
    for path in sys.argv[1:]:
        cells = []
        for ref in (base, "HEAD", "MERGE_HEAD"):
            present, size = blob(ref, path)
            label = "HEAD" if ref == "HEAD" else ("ORIG" if ref == "MERGE_HEAD" else "base")
            cells.append(f"{label}={'y(%d)' % size if present else 'n'}")
        exists = os.path.exists(path)
        wsize = os.path.getsize(path) if exists else 0
        cells.append(f"work={'y(%d)' % wsize if exists else 'n'}")
        print(f"{path}\n    " + "  ".join(cells))


if __name__ == "__main__":
    main()
