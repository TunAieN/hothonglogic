-- VIETTRUNG ORDER - POST-DDL / PARTIAL-FAILURE VERIFICATION (READ ONLY)
-- Run after each DDL file, after migration recording, or whenever a step fails.

USE `logistics_system`;

SELECT
    DATABASE() AS selected_database,
    @@port AS server_port,
    CURRENT_USER() AS authenticated_account,
    VERSION() AS mysql_version;

SELECT TABLE_NAME, ENGINE, TABLE_COLLATION, CREATE_TIME, UPDATE_TIME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('customer_payment_intents', 'sepay_webhook_events')
ORDER BY TABLE_NAME;

SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE,
       IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('customer_payment_intents', 'sepay_webhook_events')
ORDER BY TABLE_NAME, ORDINAL_POSITION;

SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE,
       GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS indexed_columns
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('customer_payment_intents', 'sepay_webhook_events')
GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
ORDER BY TABLE_NAME, INDEX_NAME;

SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME,
       REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('customer_payment_intents', 'sepay_webhook_events')
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION;

SELECT `migration`, `batch`
FROM `migrations`
WHERE `migration` IN (
    '2026_11_23_000049_create_customer_finance_sepay_domain',
    '2026_11_23_000050_harden_sepay_webhook_events'
)
ORDER BY `migration`;

-- Compare these values with the saved output from 00_preflight_read_only.sql.
SELECT
    'customers' AS entity,
    COUNT(*) AS row_count,
    COALESCE(SUM(id), 0) AS id_sum,
    COALESCE(BIT_XOR(CRC32(CONCAT_WS('#', id, code, status, COALESCE(updated_at, '')))), 0) AS fingerprint
FROM `customers`
UNION ALL
SELECT
    'payment_vouchers',
    COUNT(*),
    COALESCE(SUM(id), 0),
    COALESCE(BIT_XOR(CRC32(CONCAT_WS('#', id, voucher_code, customer_id, status,
        total_amount, paid_amount, COALESCE(updated_at, '')))), 0)
FROM `payment_vouchers`;

SELECT
    (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()) AS table_count,
    (SELECT COUNT(*) FROM customers) AS customer_count,
    (SELECT COUNT(*) FROM payment_vouchers) AS voucher_count,
    (SELECT COUNT(*) FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('customer_payment_intents', 'sepay_webhook_events')) AS target_tables_present;

-- This conditional prepared statement remains read-only and lets the file run
-- even when migration 049 stopped after creating only one of the two tables.
SET @target_tables_ready := (
    SELECT COUNT(*) = 2
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('customer_payment_intents', 'sepay_webhook_events')
);
SET @exact_target_check := IF(
    @target_tables_ready,
    'SELECT
        (SELECT COUNT(*) FROM customer_payment_intents) AS intent_count,
        (SELECT COUNT(*) FROM sepay_webhook_events) AS webhook_event_count,
        (SELECT COUNT(*) FROM customer_payment_intents cpi LEFT JOIN customers c ON c.id = cpi.customer_id WHERE c.id IS NULL) AS orphan_customer_intents,
        (SELECT COUNT(*) FROM sepay_webhook_events swe LEFT JOIN customer_payment_intents cpi ON cpi.id = swe.payment_intent_id WHERE swe.payment_intent_id IS NOT NULL AND cpi.id IS NULL) AS orphan_event_intents',
    'SELECT ''SKIPPED: both target tables do not exist yet'' AS exact_target_check'
);
PREPARE exact_target_statement FROM @exact_target_check;
EXECUTE exact_target_statement;
DEALLOCATE PREPARE exact_target_statement;

