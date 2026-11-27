-- VIETTRUNG ORDER - MANUAL EQUIVALENT OF MIGRATION 050
-- REVIEW ONLY until deployment is explicitly approved.
-- Run only after both migration-049 tables exist and are empty.
-- This single ALTER is atomic in MySQL 8.4, but DDL still implicitly commits.
-- This script deliberately does not insert into Laravel's migrations table.

USE `logistics_system`;

ALTER TABLE `sepay_webhook_events`
    ADD `bank_code` VARCHAR(40) NULL AFTER `transfer_type`,
    ADD `attempt_count` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `reconciliation_reason`,
    ADD `last_attempt_at` TIMESTAMP NULL AFTER `attempt_count`,
    ADD `next_retry_at` TIMESTAMP NULL AFTER `last_attempt_at`,
    ADD `last_error_code` VARCHAR(100) NULL AFTER `next_retry_at`,
    ADD `last_error_message` TEXT NULL AFTER `last_error_code`,
    ADD `processing_history` JSON NULL AFTER `last_error_message`,
    ADD `payload_conflict_count` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `processing_history`,
    ADD INDEX `sepay_events_retry_idx` (`status`, `next_retry_at`),
    ADD INDEX `sepay_events_reference_time_idx` (`reference`, `occurred_at`);

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, ORDINAL_POSITION
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'sepay_webhook_events'
ORDER BY ORDINAL_POSITION;

SELECT INDEX_NAME, NON_UNIQUE,
       GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS indexed_columns
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'sepay_webhook_events'
GROUP BY INDEX_NAME, NON_UNIQUE
ORDER BY INDEX_NAME;

SELECT
    (SELECT COUNT(*) FROM `customer_payment_intents`) AS customer_payment_intent_count_must_equal_0,
    (SELECT COUNT(*) FROM `sepay_webhook_events`) AS sepay_webhook_event_count_must_equal_0;

-- FAILURE RULE:
-- Do not retry blindly and do not record migration 050. Run 04_verify_read_only.sql
-- first. MySQL 8.4 atomic DDL should leave this ALTER wholly applied or unapplied;
-- confirm that observation from information_schema before any further action.

