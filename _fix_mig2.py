# -*- coding: utf-8 -*-
import os
REPO = r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912"

def load(rel):
    p = os.path.join(REPO, rel.replace("/", os.sep))
    raw = open(p, "rb").read()
    crlf = b"\r\n" in raw
    t = raw.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
    return p, t, crlf

def save(p, t, crlf):
    d = t.encode("utf-8")
    if crlf:
        d = d.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
    open(p + ".tmpmerge", "wb").write(d); os.replace(p + ".tmpmerge", p)

# ---- 1) migrations.go ----
p, t, crlf = load("backend/internal/database/migrations.go")
old_entry = ('{version: 30, name: "yingxue_payment_isolation_and_billing", '
             'checksum: "sha256:yingxue-payment-isolation-gpt6-v11-20260912-r1", '
             'apply: migrateYingxuePaymentIsolation},')
new_entry = ('{version: 30, name: yingxuePaymentIsolationName, '
             'checksum: yingxuePaymentIsolationChecksum, apply: migrateYingxuePaymentIsolation},')
assert old_entry in t, "entry missing"
t = t.replace(old_entry, new_entry)
anchor = 'const creationRuntimeChecksum = "sha256:creation-runtime-v10-20260909"\n'
assert anchor in t, "anchor missing"
t = t.replace(anchor, anchor
  + '\n// 映雪支付隔离与计费迁移在部署库里已记录为版本 11；上游 v1.5.5 把 11 分配给了\n'
    '// cloud_agent_runtime，因此这里固定改号到 30，并用常量保留原始名称与校验和。\n'
    'const yingxuePaymentIsolationName = "yingxue_payment_isolation_and_billing"\n'
    'const yingxuePaymentIsolationChecksum = "sha256:yingxue-payment-isolation-gpt6-v11-20260912-r1"\n', 1)
save(p, t, crlf)
print("patched migrations.go  crlf=", crlf)

# ---- 2) yingxue_migrations.go ----
p2, t2, crlf2 = load("backend/internal/database/yingxue_migrations.go")
old_fn = "func migrateSchemaV11(tx *gorm.DB) error {\n"
assert old_fn in t2, "fn header missing"
new_fn = (
'// migrateYingxuePaymentIsolation 对应部署库里已记录的版本 11。上游 v1.5.5 把版本 11\n'
'// 分配给了 cloud_agent_runtime，所以本函数先把已应用的旧账本行改号到 30，再执行迁移体。\n'
'// 校验和保持不变：它是这套支付隔离迁移确实在本库跑过的审计凭据。\n'
'func migrateYingxuePaymentIsolation(tx *gorm.DB) error {\n'
'\tledger, err := schemaMigrationLedger(tx)\n'
'\tif err != nil {\n'
'\t\treturn err\n'
'\t}\n'
'\tvar applied schemaMigration\n'
'\terr = tx.Table(ledger).First(&applied, "version = ?", 11).Error\n'
'\tswitch {\n'
'\tcase err == nil:\n'
'\t\tif applied.Name != yingxuePaymentIsolationName || applied.Checksum != yingxuePaymentIsolationChecksum {\n'
'\t\t\treturn fmt.Errorf("数据库迁移 11 已被 %s 占用，拒绝把映雪迁移改号到 30", applied.Name)\n'
'\t\t}\n'
'\t\tif err := tx.Table(ledger).Model(&schemaMigration{}).Where("version = ?", 11).Update("version", 30).Error; err != nil {\n'
'\t\t\treturn fmt.Errorf("重编号映雪支付隔离迁移：%w", err)\n'
'\t\t}\n'
'\t\treturn nil\n'
'\tcase errors.Is(err, gorm.ErrRecordNotFound):\n'
'\t\treturn migrateYingxuePaymentIsolationBody(tx)\n'
'\t}\n'
'\treturn fmt.Errorf("读取数据库迁移 11：%w", err)\n'
'}\n'
'\n'
'func migrateYingxuePaymentIsolationBody(tx *gorm.DB) error {\n'
)
t2 = t2.replace(old_fn, new_fn, 1)
save(p2, t2, crlf2)
print("patched yingxue_migrations.go  crlf=", crlf2)
