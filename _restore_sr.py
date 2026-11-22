import subprocess
from pathlib import Path

path = Path("web/src/services/skill-runtime.ts")
head = subprocess.run(
    ["git", "show", "HEAD:web/src/services/skill-runtime.ts"],
    capture_output=True,
    text=True,
    check=True,
).stdout

path.write_bytes(head.replace("\n", "\r\n").encode("utf-8"))

text = path.read_text(encoding="utf-8")
probes = [
    "onlineAgent",
    "localAgent",
    "progressive-tools",
    "native-package",
    "SKILL_RUNTIME_AGENT_GUIDANCE",
    "maxLinkedFilesPerSkill",
    "skill-reference-only",
    "maxContextChars: 32_000",
]
for probe in probes:
    print(f"  {probe!r}: {text.count(probe)}")
print("lines:", len(text.splitlines()))
