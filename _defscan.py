"""扫描文件的模块级/组件内定义与 import，标出给定符号的定义位置。

用法: python -X utf8 _defscan.py <file> <sym> [<sym> ...]
"""

import re
import sys


def main() -> None:
    path = sys.argv[1]
    lines = open(path, encoding="utf-8").read().split("\n")
    defs: dict[str, list[str]] = {}
    for index, line in enumerate(lines, start=1):
        for match in re.finditer(
            r"(?:^|\s)(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)",
            line,
        ):
            defs.setdefault(match.group(1), []).append(f"def:{index}")
        if line.startswith("import ") or re.match(r"^\s{4}[A-Za-z_$]", line):
            for match in re.finditer(r"import\s+(?:type\s+)?\{([^}]*)\}", line):
                for name in match.group(1).split(","):
                    clean = re.sub(r"\btype\s+", "", name).strip().split(" as ")[-1].strip()
                    if clean:
                        defs.setdefault(clean, []).append(f"imp:{index}")
            match = re.match(r"^\s*import\s+([A-Za-z_$][\w$]*)\s+from", line)
            if match:
                defs.setdefault(match.group(1), []).append(f"imp:{index}")
    for sym in sys.argv[2:]:
        print(f"{sym:36s} {defs.get(sym, [])}")


if __name__ == "__main__":
    main()
