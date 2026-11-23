"""For each path, report: whether each rev changed it vs base, and whether the
on-disk copy matches base / HEAD / MERGE_HEAD. Prints a fixed-width table."""

import os
import subprocess
import sys

BASE = "01a2d171"
REVS = (BASE, "HEAD", "MERGE_HEAD")


def blob(rev, path):
    p = subprocess.run(["git", "cat-file", "blob", f"{rev}:{path}"], capture_output=True)
    return p.stdout if p.returncode == 0 else None


def norm(data):
    return data.replace(b"\r\n", b"\n") if data is not None else None


def main(paths):
    for path in paths:
        blobs = {rev: blob(rev, path) for rev in REVS}
        disk = None
        if os.path.exists(path):
            with open(path, "rb") as fh:
                disk = fh.read()
        changed = {rev: (norm(blobs[rev]) != norm(blobs[BASE])) for rev in REVS}
        marks = "".join(
            ("H" if changed["HEAD"] else ".")
            + ("U" if changed["MERGE_HEAD"] else ".")
            for _ in (0,)
        )
        match = []
        for rev in REVS:
            if disk is not None and norm(disk) == norm(blobs[rev]):
                match.append(rev)
        print(f"{marks}  disk=={','.join(match) or 'none':12}  {path}")


if __name__ == "__main__":
    main(sys.argv[1:])
