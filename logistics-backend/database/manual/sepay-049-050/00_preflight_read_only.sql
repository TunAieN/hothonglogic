-- VIETTRUNG ORDER - SEPAY 049-050 PRE-FLIGHT (READ ONLY)
-- Safe to run in HeidiSQL against the existing DBA session.
-- This file contains no DDL and no data-changing statement.

USE `logistics_system`;

SELECT
    DATABASE() AS selected_database,
    @@port AS server_port,
    CURRENT_USER() AS authenticated_account,
    VERSION() AS mysql_version,
    @@character_set_database AS database_charset,
    @@collation_database AS database_collation,
    @@sql_mode AS sql_mode;

-- Review the returned grants manually. The active account must be the intended
-- DBA account and must be able to CREATE/ALTER/INDEX/REFERENCES on this schema.
SHOW GRANTS FOR CURRENT_USER();

SELECT check_name, result, details
FROM (
    SELECT 10 AS sort_order,
           'selected database is logistics_system' AS check_name,
           IF(DATABASE() = 'logistics_system', 'PASS', 'FAIL') AS result,
           COALESCE(DATABASE(), '<NULL>') AS details
    UNION ALL
    SELECT 20,
           'server port is 3310',
           IF(@@port = 3310, 'PASS', 'FAIL'),
           CAST(@@port AS CHAR)
    UNION ALL
    SELECT 30,
           'authenticated account is viettrung_dba',
           IF(SUBSTRING_INDEX(CURRENT_USER(), '@', 1) = 'viettrung_dba', 'PASS', 'FAIL'),
           CURRENT_USER()
    UNION ALL
    SELECT 40,
           'required parent tables exist',
           IF(COUNT(*) = 5, 'PASS', 'FAIL'),
           CONCAT(COUNT(*), '/5 tables')
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN (
          'customers', 'payment_vouchers', 'payment_accounts',
          'payment_transactions', 'customer_balance_ledgers'
      )
    UNION ALL
    SELECT 50,
           'required parent tables use InnoDB',
           IF(COUNT(*) = 5, 'PASS', 'FAIL'),
           CONCAT(COUNT(*), '/5 InnoDB tables')
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN (
          'customers', 'payment_vouchers', 'payment_accounts',
          'payment_transactions', 'customer_balance_ledgers'
      )
      AND ENGINE = 'InnoDB'
    UNION ALL
    SELECT 60,
           'required parent tables use utf8mb4_unicode_ci',
           IF(COUNT(*) = 5, 'PASS', 'FAIL'),
           CONCAT(COUNT(*), '/5 matching tables')
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN (
          'customers', 'payment_vouchers', 'payment_accounts',
          'payment_transactions', 'customer_balance_ledgers'
      )
      AND TABLE_COLLATION = 'utf8mb4_unicode_ci'
    UNION ALL
    SELECT 70,
           'parent primary keys are BIGINT UNSIGNED',
           IF(COUNT(*) = 5, 'PASS', 'FAIL'),
           CONCAT(COUNT(*), '/5 matching id columns')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN (
          'customers', 'payment_vouchers', 'payment_accounts',
          'payment_transactions', 'customer_balance_ledgers'
      )
      AND COLUMN_NAME = 'id'
      AND COLUMN_TYPE = 'bigint unsigned'
      AND COLUMN_KEY = 'PRI'
    UNION ALL
    SELECT 80,
           'SePay target tables are absent',
           IF(COUNT(*) = 0, 'PASS', 'FAIL'),
           CONCAT(COUNT(*), ' target tables already exist')
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('customer_payment_intents', 'sepay_webhook_events')
    UNION ALL
    SELECT 90,
           'migration 049 and 050 are pending',
           IF(COUNT(*) = 0, 'PASS', 'FAIL'),
           CONCAT(COUNT(*), ' migration rows already exist')
    FROM `migrations`
    WHERE `migration` IN (
        '2026_11_23_000049_create_customer_finance_sepay_domain',
        '2026_11_23_000050_harden_sepay_webhook_events'
    )
    UNION ALL
    SELECT 100,
           'required dependency migrations are recorded',
           IF(COUNT(DISTINCT migration) = 3, 'PASS', 'FAIL'),
           CONCAT(COUNT(DISTINCT migration), '/3 dependency migration rows')
    FROM `migrations`
    WHERE `migration` IN (
        '2014_10_11_000000_create_logistics_identity_tables',
        '2026_06_30_000019_create_payment_voucher_domain',
        '2026_07_08_000021_create_payment_accounts_and_snapshot_voucher_bank'
    )
    UNION ALL
    SELECT 110,
           'target constraint names are unused',
           IF(COUNT(*) = 0, 'PASS', 'FAIL'),
           CONCAT(COUNT(*), ' conflicting constraint names')
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME IN (
          'customer_payment_intents_customer_id_foreign',
          'customer_payment_intents_payment_voucher_id_foreign',
          'customer_payment_intents_payment_account_id_foreign',
          'customer_payment_intents_payment_transaction_id_foreign',
          'customer_payment_intents_ledger_id_foreign',
          'sepay_webhook_events_payment_intent_id_foreign'
      )
) AS checks
ORDER BY sort_order;

-- Baseline: save/export these two result rows and compare them with 04_verify_read_only.sql.
-- The fingerprints do not expose customer personal information.
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
    (SELECT COUNT(*) FROM payment_accounts) AS payment_account_count,
    (SELECT COUNT(*) FROM payment_transactions) AS payment_transaction_count,
    (SELECT COUNT(*) FROM customer_balance_ledgers) AS ledger_count,
    (SELECT COALESCE(MAX(batch), 0) FROM migrations) AS current_max_migration_batch;

