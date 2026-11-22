"""按字面量在文件里定位行。

用法: python -X utf8 _grep.py <file> <pat1> [<pat2> ...]
"""

import sys


def main() -> None:
    path = sys.argv[1]
    lines = open(path, encoding="utf-8").read().split("\n")
    for pat in sys.argv[2:]:
        print(f"== {pat}")
        hits = [(index, line) for index, line in enumerate(lines, start=1) if pat in line]
        if not hits:
            print("    <none>")
        for index, line in hits[:20]:
            print(f"    {index}: {line.strip()[:170]}")


if __name__ == "__main__":
    main()
