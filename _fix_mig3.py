# -*- coding: utf-8 -*-
import os
REPO = r"D:\天琊书客\项目\yingxue-upstream-v129-integration-20260912"
def load(rel):
    p = os.path.join(REPO, rel.replace("/", os.sep))
    raw = open(p, "rb").read(); crlf = b"\r\n" in raw
    return p, raw.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n"), crlf
def save(p, t, crlf):
    d = t.encode("utf-8")
    if crlf: d = d.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
    open(p + ".tmpmerge", "wb").write(d); os.replace(p + ".tmpmerge", p)

# --- yingxue_migrations.go: drop the version-based wrapper, keep simple body ---
p2, t2, crlf2 = load("backend/internal/database/yingxue_migrations.go")
start = t2.index("// migrateYingxuePaymentIsolation 对应部署库里已记录的版本 11")
end = t2.index("func migrateYingxuePaymentIsolationBody(tx *gorm.DB) error {\n")
t2 = t2[:start] + t2[end:]
t2 = t2.replace("func migrateYingxuePaymentIsolationBody(tx *gorm.DB) error {\n",
                "// migrateYingxuePaymentIsolation 对应部署库里已记录的版本 11，见 migrations.go 的\n"
                "// yingxuePaymentIsolationName 改号说明。\n"
                "func migrateYingxuePaymentIsolation(tx *gorm.DB) error {\n", 1)
save(p2, t2, crlf2)
print("yingxue_migrations.go ok")

# --- migrations.go: name-based pre-step before the migration loop ---
p, t, crlf = load("backend/internal/database/migrations.go")
anchor = """		plan, err := migrationsForDatabase(tx)
		if err != nil {
			return err
		}
		for _, item := range plan {"""
assert anchor in t
t = t.replace(anchor, """		plan, err := migrationsForDatabase(tx)
		if err != nil {
			return err
		}
		if err := renumberYingxueIsolationMigration(tx, ledger); err != nil {
			return err
		}
		for _, item := range plan {""", 1)

helper = '''
// renumberYingxueIsolationMigration 把已应用的映雪支付隔离迁移从版本 11 改号到 30。
// 上游 v1.5.5 把版本 11 分配给了 cloud_agent_runtime，两个编号在同一张账本里不能共存。
// 这里按名称定位而不是按版本号，这样对映雪部署库和纯上游库都安全，可重复执行。
func renumberYingxueIsolationMigration(tx *gorm.DB, ledger string) error {
	var applied schemaMigration
	err := tx.Table(ledger).First(&applied, "name = ?", yingxuePaymentIsolationName).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("读取映雪支付隔离迁移：%w", err)
	}
	if applied.Checksum != yingxuePaymentIsolationChecksum {
		return fmt.Errorf("映雪支付隔离迁移校验和不一致：记录为 %s", applied.Checksum)
	}
	if applied.Version == 30 {
		return nil
	}
	var occupying schemaMigration
	err = tx.Table(ledger).First(&occupying, "version = ?", 30).Error
	if err == nil {
		return fmt.Errorf("数据库迁移 30 已被 %s 占用，拒绝重编号映雪支付隔离迁移", occupying.Name)
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return fmt.Errorf("读取数据库迁移 30：%w", err)
	}
	if err := tx.Table(ledger).Model(&schemaMigration{}).Where("version = ?", applied.Version).Update("version", 30).Error; err != nil {
		return fmt.Errorf("重编号映雪支付隔离迁移：%w", err)
	}
	return nil
}

func MigrateSchema(db *gorm.DB) error {'''
t = t.replace("\nfunc MigrateSchema(db *gorm.DB) error {", helper, 1)
save(p, t, crlf)
print("migrations.go ok")
