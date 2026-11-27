-- VIETTRUNG ORDER - MANUAL EQUIVALENT OF MIGRATION 049
-- REVIEW ONLY until deployment is explicitly approved.
-- MySQL DDL implicitly commits. Execute with HeidiSQL's stop-on-error behavior.
-- Preconditions: every check in 00_preflight_read_only.sql must be PASS.
-- This script deliberately does not insert into Laravel's migrations table.

USE `logistics_system`;

-- Atomic DDL statement 1 of 2. Final names/types/constraints match Laravel --pretend output.
CREATE TABLE `customer_payment_intents` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `customer_id` BIGINT UNSIGNED NOT NULL,
    `payment_voucher_id` BIGINT UNSIGNED NULL,
    `payment_account_id` BIGINT UNSIGNED NULL,
    `payment_transaction_id` BIGINT UNSIGNED NULL,
    `ledger_id` BIGINT UNSIGNED NULL,
    `type` VARCHAR(30) NOT NULL,
    `provider` VARCHAR(30) NOT NULL DEFAULT 'sepay',
    `reference` VARCHAR(64) NOT NULL,
    `amount_vnd` BIGINT UNSIGNED NOT NULL,
    `idempotency_key` VARCHAR(100) NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
    `expires_at` TIMESTAMP NOT NULL,
    `completed_at` TIMESTAMP NULL,
    `metadata` JSON NULL,
    `created_at` TIMESTAMP NULL,
    `updated_at` TIMESTAMP NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `customer_payment_intents_reference_unique` (`reference`),
    UNIQUE KEY `customer_payment_intents_customer_idem_unique` (`customer_id`, `idempotency_key`),
    KEY `customer_payment_intents_customer_id_foreign` (`customer_id`),
    KEY `customer_payment_intents_payment_voucher_id_foreign` (`payment_voucher_id`),
    KEY `customer_payment_intents_payment_account_id_foreign` (`payment_account_id`),
    KEY `customer_payment_intents_payment_transaction_id_foreign` (`payment_transaction_id`),
    KEY `customer_payment_intents_ledger_id_foreign` (`ledger_id`),
    KEY `customer_payment_intents_customer_status_idx` (`customer_id`, `status`, `created_at`),
    KEY `customer_payment_intents_voucher_status_idx` (`payment_voucher_id`, `status`),
    CONSTRAINT `customer_payment_intents_customer_id_foreign`
        FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `customer_payment_intents_payment_voucher_id_foreign`
        FOREIGN KEY (`payment_voucher_id`) REFERENCES `payment_vouchers` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `customer_payment_intents_payment_account_id_foreign`
        FOREIGN KEY (`payment_account_id`) REFERENCES `payment_accounts` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `customer_payment_intents_payment_transaction_id_foreign`
        FOREIGN KEY (`payment_transaction_id`) REFERENCES `payment_transactions` (`id`) ON DELETE SET NULL,
    CONSTRAINT `customer_payment_intents_ledger_id_foreign`
        FOREIGN KEY (`ledger_id`) REFERENCES `customer_balance_ledgers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Atomic DDL statement 2 of 2.
CREATE TABLE `sepay_webhook_events` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `provider_transaction_id` VARCHAR(100) NOT NULL,
    `payment_intent_id` BIGINT UNSIGNED NULL,
    `payload_hash` VARCHAR(64) NOT NULL,
    `transfer_type` VARCHAR(20) NULL,
    `account_number` VARCHAR(100) NULL,
    `amount_vnd` BIGINT UNSIGNED NULL,
    `reference` VARCHAR(64) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'received',
    `reconciliation_reason` VARCHAR(100) NULL,
    `occurred_at` TIMESTAMP NULL,
    `processed_at` TIMESTAMP NULL,
    `payload` JSON NOT NULL,
    `created_at` TIMESTAMP NULL,
    `updated_at` TIMESTAMP NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `sepay_webhook_events_provider_transaction_id_unique` (`provider_transaction_id`),
    KEY `sepay_webhook_events_payment_intent_id_foreign` (`payment_intent_id`),
    KEY `sepay_webhook_events_status_created_at_index` (`status`, `created_at`),
    KEY `sepay_webhook_events_reference_index` (`reference`),
    CONSTRAINT `sepay_webhook_events_payment_intent_id_foreign`
        FOREIGN KEY (`payment_intent_id`) REFERENCES `customer_payment_intents` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Expected immediately after success: both exact counts are zero.
SELECT TABLE_NAME, ENGINE, TABLE_COLLATION
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('customer_payment_intents', 'sepay_webhook_events')
ORDER BY TABLE_NAME;

SELECT
    (SELECT COUNT(*) FROM `customer_payment_intents`) AS customer_payment_intent_count_must_equal_0,
    (SELECT COUNT(*) FROM `sepay_webhook_events`) AS sepay_webhook_event_count_must_equal_0;

-- PARTIAL FAILURE RULE:
-- If the first CREATE succeeds and the second fails, do not DROP anything and do
-- not rerun this whole file. Run 04_verify_read_only.sql, resolve the reported
-- cause, then execute only the second CREATE TABLE block above.

