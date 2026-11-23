import subprocess


def show(ref):
    return subprocess.run(["git", "show", f"{ref}:web/src/services/skill-runtime.ts"], capture_output=True, text=True).stdout


head = show("HEAD")
origin = show("origin/main")

open(r".local/cache/_sr_head.ts", "w", encoding="utf-8").write(head)
open(r".local/cache/_sr_origin.ts", "w", encoding="utf-8").write(origin)

print("HEAD lines", len(head.splitlines()), "ORIGIN lines", len(origin.splitlines()))

diff = subprocess.run(
    ["git", "diff", "HEAD", "origin/main", "--", "web/src/services/skill-runtime.ts"],
    capture_output=True,
    text=True,
).stdout
print("=== HEAD vs origin diff ===")
print(diff)
