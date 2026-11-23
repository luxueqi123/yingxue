# -*- coding: utf-8 -*-
"""分类所有 unmerged 文件：工作区内容是 ours / theirs / 混合 / 手改。"""
import subprocess, os, io, sys

REPO = r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912"


def blob(rev, path):
    return subprocess.run(["git", "show", rev + ":" + path], capture_output=True).stdout.decode("utf8")


files = subprocess.run(["git", "diff", "--name-only", "--diff-filter=U"], capture_output=True).stdout.decode("utf8").split()
rows = []
for f in files:
    p = os.path.join(REPO, f.replace("/", os.sep))
    work = io.open(p, encoding="utf8", errors="replace").read() if os.path.exists(p) else ""
    work_n = work.replace("\r\n", "\n")
    h = blob("HEAD", f).replace("\r\n", "\n")
    o = blob("origin/main", f).replace("\r\n", "\n")
    marks = work.count("<<<<<<<")
    tag = "manual"
    if marks:
        tag = "CONFLICT"
    elif work_n == h:
        tag = "ours-only"
    elif work_n == o:
        tag = "theirs-only"
    rows.append((tag, f, marks, h.count("\n"), o.count("\n"), work_n.count("\n")))

order = {"CONFLICT": 0, "ours-only": 1, "theirs-only": 2, "manual": 3}
rows.sort(key=lambda r: (order[r[0]], -r[2], r[1]))
for tag, f, marks, hl, ol, wl in rows:
    print("%-11s %-2d head=%-5d origin=%-5d work=%-5d %s" % (tag, marks, hl, ol, wl, f))
