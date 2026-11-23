"""按 (file, block_index) 用给定内容替换冲突块。

spec = {path: {block_index: [replacement_lines...]}}
block_index 从 1 开始，按文件内出现顺序计。
"""

import json
import sys
from pathlib import Path


def resolve(path: str, spec: dict) -> None:
    target = Path(path)
    newline = "\r\n" if b"\r\n" in target.read_bytes() else "\n"
    lines = target.read_bytes().decode("utf-8").split(newline)

    out = []
    index = 0
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("<<<<<<< "):
            index += 1
            depth = 1
            theirs = []
            in_theirs = False
            i += 1
            while i < len(lines):
                cur = lines[i]
                if cur.startswith("<<<<<<< "):
                    depth += 1
                elif cur.startswith(">>>>>>> "):
                    depth -= 1
                    if depth == 0:
                        break
                elif cur == "=======" and depth == 1:
                    in_theirs = True
                    i += 1
                    continue
                if in_theirs:
                    theirs.append(cur)
                i += 1
            replacement = spec.get(index, theirs)
            out.extend(replacement)
            i += 1
            continue
        out.append(line)
        i += 1

    target.write_bytes(newline.join(out).encode("utf-8"))
    text = target.read_text(encoding="utf-8")
    print(f"{path}: markers={text.count('<<<<<<<')} blocks_resolved={index}")
    if index != len(spec):
        print(f"  WARNING: spec had {len(spec)} entries, file had {index} blocks")


if __name__ == "__main__":
    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    for path, spec in payload.items():
        resolve(path, {int(k): v for k, v in spec.items()})
