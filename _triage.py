"""Compare the integration worktree against git's own 3-way merge for every
both-sides-modified path. Reports where the on-disk result diverges from the
machine-computed merge, so manual resolutions can be reviewed one by one."""

import json
import os
import subprocess
import sys

BASE = "01a2d171"
SIDE_A = "HEAD"
SIDE_B = "MERGE_HEAD"
CONFLICT_MARKERS = (b"<<<<<<<", b"=======", b">>>>>>>")
NOISE_DIRS = (".local/", "output/")


def git(*args):
    p = subprocess.run(["git", *args], capture_output=True)
    if p.returncode != 0:
        return None
    return p.stdout


def changed(rev):
    out = git("diff", "--name-only", "-z", BASE, rev)
    return set(out.decode("utf-8", "replace").split("\0")) - {""}


def norm(data):
    return data.replace(b"\r\n", b"\n") if data is not None else None


def merge3(h, b, u):
    """3-way merge using git merge-file semantics (side = ours/HEAD)."""
    tmp = ".local_triage_tmp"
    os.makedirs(tmp, exist_ok=True)
    paths = []
    for name, blob in (("a", h), ("b", b), ("c", u)):
        p = os.path.join(tmp, name)
        with open(p, "wb") as fh:
            fh.write(blob)
        paths.append(p)
    p = subprocess.run(
        ["git", "merge-file", "-p", "--diff3", paths[0], paths[1], paths[2]],
        capture_output=True,
    )
    return p.stdout, p.returncode


def classify(path, h, b, u, disk):
    expected, rc = merge3(h, b, u)
    conflicted = rc != 0 or any(m in expected for m in CONFLICT_MARKERS)
    if norm(disk) == norm(expected):
        return "auto-match", conflicted
    if norm(disk) == norm(h):
        return ("conflict-took-HEAD" if conflicted else "took-HEAD"), conflicted
    if norm(disk) == norm(u):
        return ("conflict-took-UP" if conflicted else "took-UP"), conflicted
    return ("manual-other" if not conflicted else "conflict-manual-other"), conflicted


def main():
    a = changed(SIDE_A)
    b = changed(SIDE_B)
    both = sorted(a & b)
    print(f"HEAD-changed: {len(a)}  UP-changed: {len(b)}  both: {len(both)}")
    buckets = {}
    rows = []
    for path in both:
        if path.startswith(NOISE_DIRS):
            continue
        h = git("cat-file", "blob", f"{SIDE_A}:{path}")
        bblob = git("cat-file", "blob", f"{BASE}:{path}")
        u = git("cat-file", "blob", f"{SIDE_B}:{path}")
        if h is None or bblob is None or u is None:
            buckets.setdefault("side-absent", []).append(path)
            continue
        if norm(h) == norm(u):
            buckets.setdefault("identical", []).append(path)
            continue
        disk = None
        if os.path.exists(path):
            with open(path, "rb") as fh:
                disk = fh.read()
        verdict, conflicted = classify(path, h, bblob, u, disk)
        buckets.setdefault(verdict, []).append(path)
        rows.append({"path": path, "verdict": verdict, "conflicted": conflicted})
    print()
    for key in sorted(buckets):
        print(f"{key:26} {len(buckets[key])}")
    with open("_triage.json", "w", encoding="utf-8") as fh:
        json.dump({"buckets": {k: v for k, v in buckets.items()}, "rows": rows}, fh, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
