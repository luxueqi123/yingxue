package database

import (
	"errors"
	"fmt"
	"strings"

	"gorm.io/gorm"
	"infinite-canvas/backend/internal/model"
)

const yingxueUpstreamLedger = "yingxue_upstream_schema_migrations"

// The deployed branch used versions 4-11 for different migrations. Its audit
// history stays immutable; upstream migrations execute in a separate ledger.
var yingxueDeployedMigrations = []migration{
	{version: 1, name: "baseline_gorm_schema", checksum: baselineSchemaChecksum},
	{version: 2, name: "schema_migrations_applied_at_index", checksum: schemaMigrationAppliedAtIndexChecksum},
	{version: 3, name: "asset_taxonomy_candidate_identity", checksum: assetTaxonomyCandidateIdentityChecksum},
	{version: 4, name: "payment_orders", checksum: "sha256:payment-orders-v4-20260902-r1"},
	{version: 5, name: "payment_order_qrcode_image", checksum: "sha256:payment-order-qrcode-image-v5-20260902-r1"},
	{version: 6, name: "resource_upload_key", checksum: "sha256:resource-upload-key-v6-20260905"},
	{version: 7, name: "payment_topup", checksum: "sha256:payment-topup-v7-20260905"},
	{version: 8, name: "asset_library_folders", checksum: "sha256:asset-library-folders-v8-20260905"},
	{version: 9, name: "payment_method_routing", checksum: "sha256:payment-method-routing-v9-20260905"},
	{version: 10, name: "gpt6_token_pricing", checksum: "sha256:gpt6-token-pricing-v10-20260907"},
	{version: 11, name: yingxuePaymentIsolationName, checksum: yingxuePaymentIsolationChecksum},
}

func schemaMigrationLedger(db *gorm.DB) (string, error) {
	const upstreamLedger = "schema_migrations"
	if !db.Migrator().HasTable(upstreamLedger) {
		return upstreamLedger, nil
	}
	var marker schemaMigration
	err := db.Table(upstreamLedger).First(&marker, "version = ?", 4).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return upstreamLedger, nil
	}
	if err != nil {
		return "", fmt.Errorf("读取部署迁移谱系：%w", err)
	}
	if marker.Name != "payment_orders" {
		if db.Migrator().HasTable(yingxueUpstreamLedger) {
			return "", errors.New("映雪迁移谱系标记缺失，拒绝切换迁移账本")
		}
		return upstreamLedger, nil
	}
	var history []schemaMigration
	if err := db.Table(upstreamLedger).Order("version").Find(&history).Error; err != nil {
		return "", err
	}
	if len(history) < 4 || len(history) > len(yingxueDeployedMigrations) {
		return "", errors.New("未知映雪数据库迁移谱系，拒绝自动迁移")
	}
	for i, record := range history {
		expected := yingxueDeployedMigrations[i]
		if record.Version != expected.version {
			return "", errors.New("映雪历史迁移版本不连续，拒绝自动迁移")
		}
		if err := validateMigrationRecord(record, expected); err != nil {
			return "", err
		}
	}
	return yingxueUpstreamLedger, nil
}

// migrateYingxuePaymentIsolation 对应部署库里已记录的版本 11，见 migrations.go 的
// yingxuePaymentIsolationName 改号说明。
func migrateYingxuePaymentIsolation(tx *gorm.DB) error {
	if err := tx.AutoMigrate(&model.PaymentOrder{}, &model.EPayPaymentOrder{}, &model.Prompt{}, &model.UserPromptState{}); err != nil {
		return err
	}
	// Historical charges retain their original policy and usage evidence. Empty
	// policy and unavailable cache-write usage must never be guessed from a name.
	for _, field := range []struct {
		object any
		name   string
	}{
		{&model.BillingOrder{}, "TokenPricingPolicy"},
		{&model.BillingOrder{}, "CacheWriteTokens"},
		{&model.BillingOrder{}, "CacheWriteTokensAvailable"},
		{&model.ApiCallLog{}, "CacheWriteTokens"},
		{&model.ApiCallLog{}, "CacheWriteTokensAvailable"},
	} {
		if !tx.Migrator().HasColumn(field.object, field.name) {
			if err := tx.Migrator().AddColumn(field.object, field.name); err != nil {
				return err
			}
		}
	}
	return splitYingxuePaymentOrders(tx)
}

func splitYingxuePaymentOrders(tx *gorm.DB) error {
	const source, target = "payment_orders", "payment_topup_orders"
	if !tx.Migrator().HasTable(source) || !tx.Migrator().HasColumn(source, "product_id") {
		return nil
	}
	sourceTypes, err := tx.Migrator().ColumnTypes(source)
	if err != nil {
		return err
	}
	columns := make(map[string]bool, len(sourceTypes))
	for _, column := range sourceTypes {
		columns[column.Name()] = true
	}
	for _, column := range []string{"id", "user_id", "product_id", "provider_id", "provider_config_id", "provider_config_version", "amount_fen", "currency", "credits_microcredits", "status", "merchant_order_no"} {
		if !columns[column] {
			return fmt.Errorf("旧支付表缺少上游订单字段 %s，拒绝推测转换", column)
		}
	}
	const selected = "COALESCE(TRIM(product_id), '') <> ''"
	var invalid int64
	if err := tx.Table(source).Where(selected).Where(`COALESCE(id, '') = '' OR COALESCE(user_id, '') = '' OR COALESCE(merchant_order_no, '') = '' OR COALESCE(provider_id, '') = '' OR COALESCE(amount_fen, 0) <= 0 OR COALESCE(credits_microcredits, -1) < 0 OR COALESCE(currency, '') <> 'CNY' OR COALESCE(status, '') NOT IN ('created','pending','closing','closed','credited','create_failed')`).Count(&invalid).Error; err != nil {
		return err
	}
	if invalid > 0 {
		return fmt.Errorf("旧支付表有 %d 笔订单不满足上游数据合同，拒绝转换", invalid)
	}
	if columns["plan_id"] && columns["amount_cents"] {
		if err := tx.Table(source).Where(selected).Where("COALESCE(TRIM(plan_id), '') <> '' AND COALESCE(amount_cents, 0) <> amount_fen").Count(&invalid).Error; err != nil {
			return err
		}
		if invalid > 0 {
			return fmt.Errorf("旧支付表有 %d 笔双格式订单金额不一致，拒绝转换", invalid)
		}
	}
	// The first EPay-to-topup conversion retained three terminal orders without
	// creating a provider config snapshot. Preserve those historical records as
	// read-only; never invent credentials or permit an active order exemption.
	legacyTerminal := "1 = 0"
	if columns["plan_id"] && columns["amount_cents"] && columns["paid_at"] && columns["credited_at"] {
		legacyTerminal = `COALESCE(TRIM(source_order.plan_id), '') <> ''
			AND COALESCE(source_order.amount_cents, 0) = source_order.amount_fen
			AND COALESCE(TRIM(source_order.provider_config_id), '') = ''
			AND COALESCE(source_order.provider_config_version, 0) = 0
			AND ((source_order.status = 'closed' AND source_order.paid_at IS NULL AND source_order.credited_at IS NULL)
			OR (source_order.status = 'credited' AND source_order.paid_at IS NOT NULL AND source_order.credited_at IS NOT NULL))`
	}
	if err := tx.Table(source + " AS source_order").Where("COALESCE(TRIM(source_order.product_id), '') <> ''").Where(`NOT EXISTS (SELECT 1 FROM payment_provider_configs AS config WHERE config.id = source_order.provider_config_id AND config.provider_id = source_order.provider_id AND config.version = source_order.provider_config_version)`).Where("NOT (" + legacyTerminal + ")").Count(&invalid).Error; err != nil {
		return err
	}
	if invalid > 0 {
		return fmt.Errorf("旧支付表有 %d 笔订单缺少匹配的密钥配置快照，拒绝转换", invalid)
	}
	targetTypes, err := tx.Migrator().ColumnTypes(target)
	if err != nil {
		return err
	}
	common := make([]string, 0, len(targetTypes))
	for _, column := range targetTypes {
		if columns[column.Name()] {
			common = append(common, `"`+strings.ReplaceAll(column.Name(), `"`, `""`)+`"`)
		}
	}
	if len(common) == 0 {
		return errors.New("支付迁移没有公共字段")
	}
	projection := strings.Join(common, ", ")
	// Copy exact stored values. The source table, immutable key snapshots and
	// credit ledger remain untouched; duplicate IDs must have identical content.
	if err := tx.Exec("INSERT INTO " + target + " (" + projection + ") SELECT " + projection + " FROM " + source + " WHERE " + selected + " ON CONFLICT (id) DO NOTHING").Error; err != nil {
		return fmt.Errorf("复制上游支付订单：%w", err)
	}
	if err := tx.Raw("SELECT COUNT(*) FROM (SELECT " + projection + " FROM " + source + " WHERE " + selected + " EXCEPT SELECT " + projection + " FROM " + target + ") AS mismatched_orders").Scan(&invalid).Error; err != nil {
		return err
	}
	if invalid > 0 {
		return fmt.Errorf("支付迁移有 %d 笔订单字段不一致，事务回滚", invalid)
	}
	return nil
}
