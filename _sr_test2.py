import re
import subprocess
from pathlib import Path

PATH = Path("web/test/skill-runtime.test.ts")

head = subprocess.run(["git", "show", "HEAD:web/test/skill-runtime.test.ts"], capture_output=True, text=True, check=True).stdout
origin = subprocess.run(["git", "show", "origin/main:web/test/skill-runtime.test.ts"], capture_output=True, text=True, check=True).stdout
work = PATH.read_text(encoding="utf-8")


def extract(text: str, name: str) -> str:
    lines = text.replace("\r\n", "\n").split("\n")
    for i, line in enumerate(lines):
        if f'test("{name}"' in line:
            j = i
            while j < len(lines):
                if lines[j].strip() == "});" and j > i:
                    return "\n".join(lines[i : j + 1])
                j += 1
    raise SystemExit(f"not found: {name}")


MENTION = "技能引用解析由统一规则同时支持稳定 token 和自然提及"
PROGRESSIVE = "渐进读取列出的每个路径都能被在线 Agent 按路径读回"
CLOUD = "云端 Agent 只准备已加入技能的上下文并保留来源"

head_mention = extract(head, MENTION)
work_mention = extract(work, MENTION)
cloud_block = extract(origin, CLOUD)

assert work_mention != head_mention, "expected upstream mention test to differ"

merged = head.replace("\r\n", "\n")
merged = merged.replace(head_mention, work_mention)

lines = merged.split("\n")
target = next(i for i, line in enumerate(lines) if f'test("{PROGRESSIVE}"' in line)
lines = lines[:target] + cloud_block.split("\n") + [""] + lines[target:]

PATH.write_bytes("\r\n".join(lines).encode("utf-8"))

text = PATH.read_text(encoding="utf-8")
names = re.findall(r'^\s*test\("(.*?)"', text, re.M)
print("tests:", len(names))
for name in names:
    print("   ", name)
print("markers:", text.count("<<<<<<<"))
print("has / mention assert:", 'resolveSkillMentions("/小说转分镜 处理。"' in text)
print("has / negative assert:", 'resolveSkillMentions("/AI导演增强版"' in text)
