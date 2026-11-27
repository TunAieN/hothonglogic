-- VIETTRUNG ORDER - RECORD ONLY MIGRATIONS 049 AND 050
-- This is the only file in this package that changes an existing table.
-- It records exactly two guarded rows in `migrations` and no business data.
-- On any failed precondition or unexpected insert count, it ROLLS BACK.

USE `logistics_system`;

-- Serialize repeated executions of this manual package. The subsequent
-- SERIALIZABLE transaction and row/gap lock also protect migration history.
SELECT GET_LOCK('viettrung_sepay_049_050_record', 30) INTO @named_lock_acquired;

-- No SESSION modifier: this changes only the next transaction and leaves the
-- HeidiSQL session's normal isolation setting untouched afterward.
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
START TRANSACTION;

SET @last_locked_migration_id := NULL;
SELECT `id`
INTO @last_locked_migration_id
FROM `migrations`
ORDER BY `id` DESC
LIMIT 1
FOR UPDATE;

SELECT COUNT(*)
INTO @target_table_count
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('customer_payment_intents', 'sepay_webhook_events');

SELECT COUNT(*)
INTO @table_mismatches
FROM (
    SELECT 'customer_payment_intents' AS table_name, 'InnoDB' AS engine, 'utf8mb4_unicode_ci' AS table_collation
    UNION ALL
    SELECT 'sepay_webhook_events', 'InnoDB', 'utf8mb4_unicode_ci'
) AS expected
LEFT JOIN information_schema.TABLES AS actual
  ON actual.TABLE_SCHEMA = DATABASE()
 AND actual.TABLE_NAME = expected.table_name
WHERE actual.TABLE_NAME IS NULL
   OR actual.ENGINE <> expected.engine
   OR actual.TABLE_COLLATION <> expected.table_collation
   OR actual.TABLE_TYPE <> 'BASE TABLE';

SELECT COUNT(*)
INTO @actual_column_count
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('customer_payment_intents', 'sepay_webhook_events');

SELECT COUNT(*)
INTO @column_mismatches
FROM (
    SELECT 'customer_payment_intents' AS table_name, 1 AS ordinal_position, 'id' AS column_name,
           'bigint unsigned' AS column_type, 'NO' AS is_nullable,
           CAST(NULL AS CHAR(100)) AS column_default, 'auto_increment' AS extra
    UNION ALL SELECT 'customer_payment_intents', 2, 'customer_id', 'bigint unsigned', 'NO', NULL, ''
    UNION ALL SELECT 'customer_payment_intents', 3, 'payment_voucher_id', 'bigint unsigned', 'YES', NULL, ''
    UNION ALL SELECT 'customer_payment_intents', 4, 'payment_account_id', 'bigint unsigned', 'YES', NULL, ''
    UNION ALL SELECT 'customer_payment_intents', 5, 'payment_transaction_id', 'bigint unsigned', 'YES', NULL, ''
    UNION ALL SELECT 'customer_payment_intents', 6, 'ledger_id', 'bigint unsigned', 'YES', NULL, ''
    UNION ALL SELECT 'customer_payment_intents', 7, 'type', 'varchar(30)', 'NO', NULL, ''
    UNION ALL SELECT 'customer_payment_intents', 8, 'provider', 'varchar(30)', 'NO', 'sepay', ''
    UNION ALL SELECT 'customer_payment_intents', 9, 'reference', 'varchar(64)', 'NO', NULL, ''
    UNION ALL SELECT 'customer_payment_intents', 10, 'amount_vnd', 'bigint unsigned', 'NO', NULL, ''
    UNION ALL SELECT 'customer_payment_intents', 11, 'idempotency_key', 'varchar(100)', 'NO', NULL, ''
    UNION ALL SELECT 'customer_payment_intents', 12, 'status', 'varchar(30)', 'NO', 'pending', ''
    UNION ALL SELECT 'customer_payment_intents', 13, 'expires_at', 'timestamp', 'NO', NULL, ''
    UNION ALL SELECT 'customer_payment_intents', 14, 'completed_at', 'timestamp', 'YES', NULL, ''
    UNION ALL SELECT 'customer_payment_intents', 15, 'metadata', 'json', 'YES', NULL, ''
    UNION ALL SELECT 'customer_payment_intents', 16, 'created_at', 'timestamp', 'YES', NULL, ''
    UNION ALL SELECT 'customer_payment_intents', 17, 'updated_at', 'timestamp', 'YES', NULL, ''
    UNION ALL SELECT 'sepay_webhook_events', 1, 'id', 'bigint unsigned', 'NO', NULL, 'auto_increment'
    UNION ALL SELECT 'sepay_webhook_events', 2, 'provider_transaction_id', 'varchar(100)', 'NO', NULL, ''
    UNION ALL SELECT 'sepay_webhook_events', 3, 'payment_intent_id', 'bigint unsigned', 'YES', NULL, ''
    UNION ALL SELECT 'sepay_webhook_events', 4, 'payload_hash', 'varchar(64)', 'NO', NULL, ''
    UNION ALL SELECT 'sepay_webhook_events', 5, 'transfer_type', 'varchar(20)', 'YES', NULL, ''
    UNION ALL SELECT 'sepay_webhook_events', 6, 'bank_code', 'varchar(40)', 'YES', NULL, ''
    UNION ALL SELECT 'sepay_webhook_events', 7, 'account_number', 'varchar(100)', 'YES', NULL, ''
    UNION ALL SELECT 'sepay_webhook_events', 8, 'amount_vnd', 'bigint unsigned', 'YES', NULL, ''
    UNION ALL SELECT 'sepay_webhook_events', 9, 'reference', 'varchar(64)', 'YES', NULL, ''
    UNION ALL SELECT 'sepay_webhook_events', 10, 'status', 'varchar(30)', 'NO', 'received', ''
    UNION ALL SELECT 'sepay_webhook_events', 11, 'reconciliation_reason', 'varchar(100)', 'YES', NULL, ''
    UNION ALL SELECT 'sepay_webhook_events', 12, 'attempt_count', 'int unsigned', 'NO', '0', ''
    UNION ALL SELECT 'sepay_webhook_events', 13, 'last_attempt_at', 'timestamp', 'YES', NULL, ''
    UNION ALL SELECT 'sepay_webhook_events', 14, 'next_retry_at', 'timestamp', 'YES', NULL, ''
    UNION ALL SELECT 'sepay_webhook_events', 15, 'last_error_code', 'varchar(100)', 'YES', NULL, ''
    UNION ALL SELECT 'sepay_webhook_events', 16, 'last_error_message', 'text', 'YES', NULL, ''
    UNION ALL SELECT 'sepay_webhook_events', 17, 'processing_history', 'json', 'YES', NULL, ''
    UNION ALL SELECT 'sepay_webhook_events', 18, 'payload_conflict_count', 'int unsigned', 'NO', '0', ''
    UNION ALL SELECT 'sepay_webhook_events', 19, 'occurred_at', 'timestamp', 'YES', NULL, ''
    UNION ALL SELECT 'sepay_webhook_events', 20, 'processed_at', 'timestamp', 'YES', NULL, ''
    UNION ALL SELECT 'sepay_webhook_events', 21, 'payload', 'json', 'NO', NULL, ''
    UNION ALL SELECT 'sepay_webhook_events', 22, 'created_at', 'timestamp', 'YES', NULL, ''
    UNION ALL SELECT 'sepay_webhook_events', 23, 'updated_at', 'timestamp', 'YES', NULL, ''
) AS expected
LEFT JOIN information_schema.COLUMNS AS actual
  ON actual.TABLE_SCHEMA = DATABASE()
 AND actual.TABLE_NAME = expected.table_name
 AND actual.COLUMN_NAME = expected.column_name
WHERE actual.COLUMN_NAME IS NULL
   OR actual.ORDINAL_POSITION <> expected.ordinal_position
   OR LOWER(actual.COLUMN_TYPE) <> expected.column_type
   OR actual.IS_NULLABLE <> expected.is_nullable
   OR NOT (actual.COLUMN_DEFAULT <=> expected.column_default)
   OR actual.EXTRA <> expected.extra;

SELECT COUNT(*)
INTO @column_collation_mismatches
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('customer_payment_intents', 'sepay_webhook_events')
  AND DATA_TYPE IN ('char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext')
  AND COLLATION_NAME <> 'utf8mb4_unicode_ci';

SELECT COUNT(*)
INTO @actual_index_count
FROM (
    SELECT TABLE_NAME, INDEX_NAME
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('customer_payment_intents', 'sepay_webhook_events')
    GROUP BY TABLE_NAME, INDEX_NAME
) AS actual_indexes;

SELECT COUNT(*)
INTO @index_mismatches
FROM (
    SELECT 'customer_payment_intents' AS table_name, 'PRIMARY' AS index_name, 0 AS non_unique, 'BTREE' AS index_type, 'id' AS indexed_columns
    UNION ALL SELECT 'customer_payment_intents', 'customer_payment_intents_reference_unique', 0, 'BTREE', 'reference'
    UNION ALL SELECT 'customer_payment_intents', 'customer_payment_intents_customer_idem_unique', 0, 'BTREE', 'customer_id,idempotency_key'
    UNION ALL SELECT 'customer_payment_intents', 'customer_payment_intents_customer_id_foreign', 1, 'BTREE', 'customer_id'
    UNION ALL SELECT 'customer_payment_intents', 'customer_payment_intents_payment_voucher_id_foreign', 1, 'BTREE', 'payment_voucher_id'
    UNION ALL SELECT 'customer_payment_intents', 'customer_payment_intents_payment_account_id_foreign', 1, 'BTREE', 'payment_account_id'
    UNION ALL SELECT 'customer_payment_intents', 'customer_payment_intents_payment_transaction_id_foreign', 1, 'BTREE', 'payment_transaction_id'
    UNION ALL SELECT 'customer_payment_intents', 'customer_payment_intents_ledger_id_foreign', 1, 'BTREE', 'ledger_id'
    UNION ALL SELECT 'customer_payment_intents', 'customer_payment_intents_customer_status_idx', 1, 'BTREE', 'customer_id,status,created_at'
    UNION ALL SELECT 'customer_payment_intents', 'customer_payment_intents_voucher_status_idx', 1, 'BTREE', 'payment_voucher_id,status'
    UNION ALL SELECT 'sepay_webhook_events', 'PRIMARY', 0, 'BTREE', 'id'
    UNION ALL SELECT 'sepay_webhook_events', 'sepay_webhook_events_provider_transaction_id_unique', 0, 'BTREE', 'provider_transaction_id'
    UNION ALL SELECT 'sepay_webhook_events', 'sepay_webhook_events_payment_intent_id_foreign', 1, 'BTREE', 'payment_intent_id'
    UNION ALL SELECT 'sepay_webhook_events', 'sepay_webhook_events_status_created_at_index', 1, 'BTREE', 'status,created_at'
    UNION ALL SELECT 'sepay_webhook_events', 'sepay_webhook_events_reference_index', 1, 'BTREE', 'reference'
    UNION ALL SELECT 'sepay_webhook_events', 'sepay_events_retry_idx', 1, 'BTREE', 'status,next_retry_at'
    UNION ALL SELECT 'sepay_webhook_events', 'sepay_events_reference_time_idx', 1, 'BTREE', 'reference,occurred_at'
) AS expected
LEFT JOIN (
    SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, INDEX_TYPE,
           GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS indexed_columns
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('customer_payment_intents', 'sepay_webhook_events')
    GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE, INDEX_TYPE
) AS actual
  ON actual.TABLE_NAME = expected.table_name
 AND actual.INDEX_NAME = expected.index_name
WHERE actual.INDEX_NAME IS NULL
   OR actual.NON_UNIQUE <> expected.non_unique
   OR actual.INDEX_TYPE <> expected.index_type
   OR actual.indexed_columns <> expected.indexed_columns;

SELECT COUNT(*)
INTO @actual_unique_constraint_count
FROM information_schema.TABLE_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('customer_payment_intents', 'sepay_webhook_events')
  AND CONSTRAINT_TYPE = 'UNIQUE';

SELECT COUNT(*)
INTO @unique_constraint_mismatches
FROM (
    SELECT 'customer_payment_intents' AS table_name,
           'customer_payment_intents_reference_unique' AS constraint_name
    UNION ALL
    SELECT 'customer_payment_intents', 'customer_payment_intents_customer_idem_unique'
    UNION ALL
    SELECT 'sepay_webhook_events', 'sepay_webhook_events_provider_transaction_id_unique'
) AS expected
LEFT JOIN information_schema.TABLE_CONSTRAINTS AS actual
  ON actual.CONSTRAINT_SCHEMA = DATABASE()
 AND actual.TABLE_NAME = expected.table_name
 AND actual.CONSTRAINT_NAME = expected.constraint_name
 AND actual.CONSTRAINT_TYPE = 'UNIQUE'
WHERE actual.CONSTRAINT_NAME IS NULL;

SELECT COUNT(*)
INTO @actual_foreign_key_count
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('customer_payment_intents', 'sepay_webhook_events');

SELECT COUNT(*)
INTO @foreign_key_mismatches
FROM (
    SELECT 'customer_payment_intents' AS table_name,
           'customer_payment_intents_customer_id_foreign' AS constraint_name,
           'customer_id' AS column_name, 'customers' AS referenced_table_name,
           'id' AS referenced_column_name, 'RESTRICT' AS delete_rule, 'NO ACTION' AS update_rule
    UNION ALL SELECT 'customer_payment_intents', 'customer_payment_intents_payment_voucher_id_foreign',
        'payment_voucher_id', 'payment_vouchers', 'id', 'RESTRICT', 'NO ACTION'
    UNION ALL SELECT 'customer_payment_intents', 'customer_payment_intents_payment_account_id_foreign',
        'payment_account_id', 'payment_accounts', 'id', 'RESTRICT', 'NO ACTION'
    UNION ALL SELECT 'customer_payment_intents', 'customer_payment_intents_payment_transaction_id_foreign',
        'payment_transaction_id', 'payment_transactions', 'id', 'SET NULL', 'NO ACTION'
    UNION ALL SELECT 'customer_payment_intents', 'customer_payment_intents_ledger_id_foreign',
        'ledger_id', 'customer_balance_ledgers', 'id', 'SET NULL', 'NO ACTION'
    UNION ALL SELECT 'sepay_webhook_events', 'sepay_webhook_events_payment_intent_id_foreign',
        'payment_intent_id', 'customer_payment_intents', 'id', 'SET NULL', 'NO ACTION'
) AS expected
LEFT JOIN information_schema.KEY_COLUMN_USAGE AS kcu
  ON kcu.CONSTRAINT_SCHEMA = DATABASE()
 AND kcu.TABLE_NAME = expected.table_name
 AND kcu.CONSTRAINT_NAME = expected.constraint_name
 AND kcu.COLUMN_NAME = expected.column_name
LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS AS rc
  ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
 AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
WHERE kcu.CONSTRAINT_NAME IS NULL
   OR kcu.REFERENCED_TABLE_NAME <> expected.referenced_table_name
   OR kcu.REFERENCED_COLUMN_NAME <> expected.referenced_column_name
   OR rc.DELETE_RULE <> expected.delete_rule
   OR rc.UPDATE_RULE <> expected.update_rule;

-- Exact COUNT(*) checks; this remains safe if migration 049 stopped partially.
SET @target_tables_empty := 0;
SET @empty_check_sql := IF(
    @target_table_count = 2,
    'SELECT IF((SELECT COUNT(*) FROM customer_payment_intents) = 0 AND (SELECT COUNT(*) FROM sepay_webhook_events) = 0, 1, 0) INTO @target_tables_empty',
    'SET @target_tables_empty := 0'
);
PREPARE empty_check_statement FROM @empty_check_sql;
EXECUTE empty_check_statement;
DEALLOCATE PREPARE empty_check_statement;

SELECT COUNT(*)
INTO @existing_target_migration_rows
FROM `migrations`
WHERE `migration` IN (
    '2026_11_23_000049_create_customer_finance_sepay_domain',
    '2026_11_23_000050_harden_sepay_webhook_events'
);

SET @schema_ready := (
    DATABASE() = 'logistics_system'
    AND @@port = 3310
    AND SUBSTRING_INDEX(CURRENT_USER(), '@', 1) = 'viettrung_dba'
    AND @named_lock_acquired = 1
    AND @target_table_count = 2
    AND @table_mismatches = 0
    AND @actual_column_count = 40
    AND @column_mismatches = 0
    AND @column_collation_mismatches = 0
    AND @actual_index_count = 17
    AND @index_mismatches = 0
    AND @actual_unique_constraint_count = 3
    AND @unique_constraint_mismatches = 0
    AND @actual_foreign_key_count = 6
    AND @foreign_key_mismatches = 0
    AND @target_tables_empty = 1
    AND @existing_target_migration_rows = 0
);

SELECT COALESCE(MAX(`batch`), 0) + 1
INTO @next_batch
FROM `migrations`;

SELECT
    @schema_ready AS schema_ready_must_equal_1,
    @named_lock_acquired AS named_lock_must_equal_1,
    @target_table_count AS target_table_count_must_equal_2,
    @table_mismatches AS table_mismatches_must_equal_0,
    @actual_column_count AS actual_column_count_must_equal_40,
    @column_mismatches AS column_mismatches_must_equal_0,
    @column_collation_mismatches AS column_collation_mismatches_must_equal_0,
    @actual_index_count AS actual_index_count_must_equal_17,
    @index_mismatches AS index_mismatches_must_equal_0,
    @actual_unique_constraint_count AS actual_unique_constraint_count_must_equal_3,
    @unique_constraint_mismatches AS unique_constraint_mismatches_must_equal_0,
    @actual_foreign_key_count AS actual_foreign_key_count_must_equal_6,
    @foreign_key_mismatches AS foreign_key_mismatches_must_equal_0,
    @target_tables_empty AS target_tables_empty_must_equal_1,
    @existing_target_migration_rows AS existing_target_migration_rows_must_equal_0,
    @next_batch AS batch_that_will_be_used;

-- One atomic INSERT is either exactly two rows or zero/error.
INSERT INTO `migrations` (`migration`, `batch`)
SELECT migration_name, @next_batch
FROM (
    SELECT '2026_11_23_000049_create_customer_finance_sepay_domain' AS migration_name
    UNION ALL
    SELECT '2026_11_23_000050_harden_sepay_webhook_events'
) AS requested_migrations
WHERE @schema_ready = 1;

SELECT COUNT(*), COUNT(DISTINCT `migration`), MIN(`batch`), MAX(`batch`)
INTO @recorded_row_count, @recorded_distinct_count, @recorded_min_batch, @recorded_max_batch
FROM `migrations`
WHERE `migration` IN (
    '2026_11_23_000049_create_customer_finance_sepay_domain',
    '2026_11_23_000050_harden_sepay_webhook_events'
);

-- Do not use ROW_COUNT() here. HeidiSQL may execute an internal statement
-- between script statements, which resets ROW_COUNT() to zero. Because the
-- named lock plus SERIALIZABLE transaction protects this exact migration set,
-- the before/after cardinality delta is the reliable inserted-row count.
SET @inserted_rows := @recorded_row_count - @existing_target_migration_rows;

SET @commit_allowed := (
    @schema_ready = 1
    AND @inserted_rows = 2
    AND @recorded_row_count = 2
    AND @recorded_distinct_count = 2
    AND @recorded_min_batch = @next_batch
    AND @recorded_max_batch = @next_batch
);

-- MySQL 8.4 permits COMMIT, but not ROLLBACK, as a prepared statement. On
-- success COMMIT is executed. On failure DO 0 keeps the transaction open; the
-- unconditional ROLLBACK immediately after EXECUTE then cancels it. After a
-- successful COMMIT, that same ROLLBACK is harmless because no transaction remains.
SET @finish_transaction_sql := IF(@commit_allowed, 'COMMIT', 'DO 0');
PREPARE finish_transaction_statement FROM @finish_transaction_sql;
EXECUTE finish_transaction_statement;
DEALLOCATE PREPARE finish_transaction_statement;
ROLLBACK;

SELECT IF(@commit_allowed,
          'SUCCESS_COMMITTED_EXACTLY_TWO_MIGRATIONS',
          'FAILED_ROLLED_BACK_NO_MIGRATION_HISTORY_CONFIRMED') AS recording_result,
       @inserted_rows AS attempted_insert_row_count,
       @recorded_row_count AS rows_seen_before_transaction_finish,
       @next_batch AS attempted_batch;

SELECT RELEASE_LOCK('viettrung_sepay_049_050_record') AS named_lock_release_result;

SELECT `migration`, `batch`
FROM `migrations`
WHERE `migration` IN (
    '2026_11_23_000049_create_customer_finance_sepay_domain',
    '2026_11_23_000050_harden_sepay_webhook_events'
)
ORDER BY `migration`;

