"""Grep a revision's whole tree for a literal token; prints rev, path, line no."""

import subprocess
import sys


def rev_files(rev):
    p = subprocess.run(["git", "ls-tree", "-r", "--name-only", "-z", rev], capture_output=True)
    return [x for x in p.stdout.decode("utf-8", "replace").split("\0") if x]


def blob(rev, path):
    p = subprocess.run(["git", "cat-file", "blob", f"{rev}:{path}"], capture_output=True)
    return p.stdout if p.returncode == 0 else None


def main():
    token = sys.argv[1].encode()
    revs = sys.argv[2:] or ["HEAD", "MERGE_HEAD"]
    for rev in revs:
        hits = []
        for path in rev_files(rev):
            data = blob(rev, path)
            if data is None or token not in data:
                continue
            count = data.count(token)
            hits.append((path, count))
        print(f"===== {rev}: {len(hits)} files contain {token!r}")
        for path, count in hits:
            print(f"   {count:4}  {path}")


if __name__ == "__main__":
    main()
