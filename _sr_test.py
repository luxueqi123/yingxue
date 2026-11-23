import re
import subprocess
from pathlib import Path

PATH = Path("web/test/skill-runtime.test.ts")

head = subprocess.run(["git", "show", "HEAD:web/test/skill-runtime.test.ts"], capture_output=True, text=True).stdout
origin = subprocess.run(["git", "show", "origin/main:web/test/skill-runtime.test.ts"], capture_output=True, text=True).stdout


def extract(text: str, name: str) -> str:
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if f'test("{name}"' in line:
            j = i
            while j < len(lines):
                if lines[j].strip() == "});" and j > i:
                    return "\n".join(lines[i : j + 1])
                j += 1
    raise SystemExit(f"not found: {name}")


CLOUD = "云端 Agent 只准备已加入技能的上下文并保留来源"
PROGRESSIVE = "渐进读取列出的每个路径都能被在线 Agent 按路径读回"

cloud_block = extract(origin, CLOUD)

head_lines = head.split("\n")
# 在“渐进读取”测试之前插入上游的云端 Agent 测试。
target = next(i for i, line in enumerate(head_lines) if f'test("{PROGRESSIVE}"' in line)
merged = head_lines[:target] + cloud_block.split("\n") + [""] + head_lines[target:]

text = "\r\n".join(merged)
PATH.write_bytes(text.encode("utf-8"))

names = re.findall(r'^\s*test\("(.*?)"', PATH.read_text(encoding="utf-8"), re.M)
print("tests:", len(names))
for name in names:
    print("   ", name)
print("markers:", PATH.read_text(encoding="utf-8").count("<<<<<<<"))
