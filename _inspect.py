"""Print a named function (or the +/- hunks between two files) for review."""

import subprocess
import sys


def blob(rev, path):
    p = subprocess.run(["git", "cat-file", "blob", f"{rev}:{path}"], capture_output=True)
    return p.stdout.decode("utf-8", "replace") if p.returncode == 0 else None


def show_func(text, name, limit=2000):
    i = text.find(name)
    if i < 0:
        return f"<{name}: not found>"
    return text[i : i + limit]


if __name__ == "__main__":
    path, name = sys.argv[1], sys.argv[2]
    revs = sys.argv[3:] or ["MERGE_HEAD"]
    for rev in revs:
        text = blob(rev, path)
        print(f"===== {rev}")
        print(show_func(text or "", name))
