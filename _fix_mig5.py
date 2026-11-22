# -*- coding: utf-8 -*-
import os
REPO = r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912"
p = os.path.join(REPO, "backend/internal/database/migrations.go")
raw = open(p, "rb").read(); crlf = b"\r\n" in raw
t = raw.decode("utf-8").replace("\r\n", "\n")
lines = t.split("\n")

bad = [i for i, l in enumerate(lines) if "映雪二开迁移固定排在" in l]
print("bad comment lines:", bad)
i_comment = bad[0]
assert "version: 30, name: yingxuePaymentIsolationName" in lines[i_comment+1]
del lines[i_comment:i_comment+2]

# find the literal's closing brace
i_29 = [i for i, l in enumerate(lines) if "agent_resource_leases" in l][0]
j = i_29
while lines[j].strip() != "}},":
    j += 1
k = j + 1
assert lines[k] == "}", repr(lines[k])
entry_comment = "\t// 映雪二开迁移固定排在 v1.5.5 之后：上游 v1..v29 的版本号必须与 origin/main 完全一致，否则下一次合并会把两套编号再撞一次。"
entry = "\t{version: 30, name: yingxuePaymentIsolationName, checksum: yingxuePaymentIsolationChecksum, apply: migrateYingxuePaymentIsolation},"
lines[k:k] = [entry_comment, entry]

t = "\n".join(lines)
d = t.encode("utf-8")
if crlf: d = d.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
open(p + ".tmpmerge", "wb").write(d); os.replace(p + ".tmpmerge", p)
print("fixed; total lines", len(lines))
