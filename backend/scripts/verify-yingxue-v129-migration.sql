-- Read-only post-migration checks for a restored production clone.
-- Compare counts and balances with the pre-migration snapshot; never print keys.
BEGIN READ ONLY;

SELECT 'users' AS object, COUNT(*) AS rows FROM users
UNION ALL SELECT 'credit_accounts', COUNT(*) FROM credit_accounts
UNION ALL SELECT 'credit_ledger_entries', COUNT(*) FROM credit_ledger_entries
UNION ALL SELECT 'payment_orders_source', COUNT(*) FROM payment_orders
UNION ALL SELECT 'payment_topup_orders', COUNT(*) FROM payment_topup_orders;

SELECT SUM(available_microcredits) AS available_microcredits,
       SUM(reserved_microcredits) AS reserved_microcredits,
       SUM(version) AS account_versions
FROM credit_accounts;

SELECT version, name, checksum FROM schema_migrations ORDER BY version;
SELECT version, name, checksum FROM yingxue_upstream_schema_migrations ORDER BY version;

SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = current_schema() AND tablename = 'payment_topup_orders'
ORDER BY indexname;

SELECT 'source' AS location, status, COUNT(*) AS rows
FROM payment_orders WHERE COALESCE(TRIM(product_id), '') <> '' GROUP BY status
UNION ALL
SELECT 'target', status, COUNT(*) FROM payment_topup_orders GROUP BY status
ORDER BY status, location;

SELECT COUNT(*) AS missing_or_changed_orders
FROM payment_orders source_order
LEFT JOIN payment_topup_orders copied ON copied.id = source_order.id
WHERE COALESCE(TRIM(source_order.product_id), '') <> ''
  AND (copied.id IS NULL OR EXISTS (
    SELECT 1 FROM jsonb_each(to_jsonb(copied)) field
    WHERE to_jsonb(source_order) ? field.key
      AND (to_jsonb(source_order) -> field.key) IS DISTINCT FROM field.value
  ));

WITH missing_snapshots AS (
  SELECT COALESCE(
    COALESCE(TRIM(source_order.plan_id), '') <> '' AND source_order.amount_cents = orders.amount_fen
    AND COALESCE(TRIM(orders.provider_config_id), '') = '' AND COALESCE(orders.provider_config_version, 0) = 0
    AND ((orders.status = 'closed' AND source_order.paid_at IS NULL AND orders.credited_at IS NULL)
      OR (orders.status = 'credited' AND source_order.paid_at IS NOT NULL AND orders.credited_at IS NOT NULL)), false
  ) AS explained_legacy_terminal
  FROM payment_topup_orders orders
  LEFT JOIN payment_orders source_order ON source_order.id = orders.id
  LEFT JOIN payment_provider_configs config ON config.id = orders.provider_config_id
    AND config.provider_id = orders.provider_id AND config.version = orders.provider_config_version
  WHERE config.id IS NULL
)
SELECT COUNT(*) AS unmatched_payment_config_snapshots,
  COUNT(*) FILTER (WHERE explained_legacy_terminal) AS historical_terminal_without_config_snapshot,
  COUNT(*) FILTER (WHERE NOT explained_legacy_terminal) AS unexplained_missing_config_snapshots
FROM missing_snapshots;

SELECT COUNT(*) AS duplicated_credit_references FROM (
  SELECT reference_key FROM credit_ledger_entries WHERE reference_key IS NOT NULL
  GROUP BY reference_key HAVING COUNT(*) > 1
) duplicated;

COMMIT;
