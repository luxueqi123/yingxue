# -*- coding: utf-8 -*-
"""Resolve migrations.go: keep upstream v1..v29 verbatim, move 映雪's own
migration into the private next slot (v30) and relocate the already-applied
v11 ledger record on the 映雪 lineage."""
import io, os, json, sys

REPO = r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912"
rel = "backend/internal/database/migrations.go"
p = os.path.join(REPO, rel)
raw = open(p, "rb").read()
crlf = b"\r\n" in raw
lines = raw.decode("utf-8").split("\n")

# --- locate conflict blocks -------------------------------------------------
blks = []
i = 0
while i < len(lines):
    if lines[i].startswith("<<<<<<< "):
        s = i; j = i; mid = None
        while j < len(lines) and not lines[j].startswith(">>>>>>> "):
            if lines[j].startswith("=======") and mid is None:
                mid = j
            j += 1
        blks.append((s, mid, j)); i = j + 1
    else:
        i += 1
print("blocks:", [(b[0]+1, b[1]+1, b[2]+1) for b in blks])

# --- B1: version constant --------------------------------------------------
B1 = blks[0]
new_b1 = ["const CurrentSchemaVersion int64 = 30"]

# --- B2: migration table ---------------------------------------------------
B2 = blks[1]
s, mid, e = B2
theirs = lines[mid+1:e]
print("theirs lines:", len(theirs))
print("first:", theirs[0].strip())
print("last :", theirs[-2].strip(), "|", theirs[-1].strip())

YINGXUE_ENTRY = (
    '\t// 映雪二开迁移固定排在 v1.5.5 之后：上游 v1..v29 的版本号必须与 origin/main '
    '完全一致，否则下一次合并会把两套编号再撞一次。\n'
    '\t{version: 30, name: "yingxue_payment_isolation_and_billing", '
    'checksum: "sha256:yingxue-payment-isolation-gpt6-v11-20260912-r1", '
    'apply: migrateYingxuePaymentIsolation},'
)

# find the closing "}" of the schemaMigrations literal = last line of theirs
assert theirs[-1].strip() == "}", theirs[-1]
new_b2 = list(theirs)
new_b2[-1:-1] = [YINGXUE_ENTRY]

# apply from the back so earlier offsets stay valid
for (s, mid, e), repl in sorted(((B1, new_b1), (B2, new_b2)), key=lambda x: -x[0][0]):
    lines[s:e+1] = repl

out = "\n".join(lines)
data = out.encode("utf-8")
if crlf:
    data = data.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
tmp = p + ".tmpmerge"
open(tmp, "wb").write(data)
os.replace(tmp, p)
print("written", rel)
