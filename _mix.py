"""按 plain 区/冲突区把 worktree 行与 HEAD、ORIGIN 对齐，统计混合情况。

用法: python -X utf8 _mix.py <file>
输出: 每个 plain 区块的来源标签(head / origin / both / neither)摘要。
"""

import subprocess
import sys
from collections import Counter


def show(ref: str, path: str) -> list[str]:
    out = subprocess.run(["git", "show", f"{ref}:{path}"], capture_output=True)
    return out.stdout.decode("utf-8", errors="replace").split("\n")


def main() -> None:
    path = sys.argv[1]
    head = show("HEAD", path)
    orig = show("MERGE_HEAD", path)
    work = open(path, encoding="utf-8").read().split("\n")

    head_set = Counter(line.strip() for line in head if line.strip())
    orig_set = Counter(line.strip() for line in orig if line.strip())

    blocks = []
    i = 0
    while i < len(work):
        if work[i].startswith("<<<<<<<"):
            start = i
            while not work[i].startswith(">>>>>>>"):
                i += 1
            blocks.append((start, i, "conflict"))
        else:
            blocks.append((i, i, "plain"))
        i += 1

    # 合并相邻 plain 行为区块
    runs = []
    for start, end, kind in blocks:
        if runs and runs[-1][2] == kind == "plain" and runs[-1][1] == start - 1:
            runs[-1][1] = end
        else:
            runs.append([start, end, kind])

    stats = Counter()
    idx = 0
    for start, end, kind in runs:
        if kind == "conflict":
            idx += 1
            print(f"B{idx} conflict lines {start + 1}-{end + 1}")
            continue
        only_head = only_orig = both = neither = blank = 0
        for j in range(start, end + 1):
            text = work[j].strip()
            if not text:
                blank += 1
                continue
            in_head = head_set[text] > 0
            in_orig = orig_set[text] > 0
            if in_head and in_orig:
                both += 1
            elif in_head:
                only_head += 1
            elif in_orig:
                only_orig += 1
            else:
                neither += 1
        stats["both"] += both
        stats["head"] += only_head
        stats["origin"] += only_orig
        stats["neither"] += neither
        print(
            f"plain {start + 1}-{end + 1}  both={both} head_only={only_head} origin_only={only_orig} neither={neither} blank={blank}"
        )
    print("TOTAL", dict(stats))


if __name__ == "__main__":
    main()
