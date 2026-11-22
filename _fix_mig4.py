# -*- coding: utf-8 -*-
import os
REPO = r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912"
p = os.path.join(REPO, "backend/internal/database/migrations.go")
raw = open(p, "rb").read(); crlf = b"\r\n" in raw
t = raw.decode("utf-8").replace("\r\n", "\n")
lines = t.split("\n")

# 1) remove the entry wrongly inserted inside migrateSchemaV14
bad_comment = "// 映雪二开迁移固定排在 v1.5.5 之后：上游 v1..v29 的版本号必须与 origin/main 完全一致，否则下一次合并会把两套编号再撞一次。"
bad_entry = "\t{version: 30, name: yingxuePaymentIsolationName, checksum: yingxuePaymentIsolationChecksum, apply: migrateYingxuePaymentIsolation},"
i_comment = lines.index(bad_comment)
i_entry = lines.index(bad_entry)
assert i_entry == i_comment + 1, (i_comment, i_entry)
del lines[i_comment:i_entry+1]

# 2) insert right before the closing brace of the schemaMigrations literal
i_close = lines.index("{version: 29, name: \"agent_resource_leases\", checksum: \"sha256:agent-resource-leases-v29-20260919\", apply: func(tx *gorm.DB) error {")
# find its closing "}}," then the "}" that ends the literal
j = i_close
while lines[j] != "}},":
    j += 1
k = j + 1
assert lines[k] == "}", repr(lines[k])
lines[k:k] = [bad_comment, bad_entry]

t = "\n".join(lines)
d = t.encode("utf-8")
if crlf: d = d.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
open(p + ".tmpmerge", "wb").write(d); os.replace(p + ".tmpmerge", p)
print("fixed")
