"""列出 plain（非冲突）区里只出现在某一侧的行。

用法: python -X utf8 _plainonly.py <file> <head|origin>
"""

import subprocess
import sys


def lines_of(ref: str, path: str) -> set[str]:
    text = subprocess.run(["git", "show", f"{ref}:{path}"], capture_output=True).stdout.decode("utf-8", errors="replace")
    return {line.strip() for line in text.split("\n") if line.strip()}


def main() -> None:
    path, side = sys.argv[1], sys.argv[2]
    head = lines_of("HEAD", path)
    orig = lines_of("MERGE_HEAD", path)
    work = open(path, encoding="utf-8").read().split("\n")

    inside = False
    for index, line in enumerate(work, start=1):
        if line.startswith("<<<<<<<"):
            inside = True
            print(f"{index}: <<<<<<< BLOCK START")
            continue
        if line.startswith(">>>>>>>"):
            inside = False
            print(f"{index}: >>>>>>> BLOCK END")
            continue
        if inside:
            continue
        text = line.strip()
        if not text:
            continue
        if side == "origin" and text in orig and text not in head:
            print(f"{index}: {line}")
        if side == "head" and text in head and text not in orig:
            print(f"{index}: {line}")


if __name__ == "__main__":
    main()
