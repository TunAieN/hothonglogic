-- VIP/deposit policy migration 051: exact HeidiSQL schema + seed phase.
-- Run only after 01_heidisql_preflight.sql passes and the reviewed backup exists.
-- IMPORTANT: MySQL DDL auto-commits. On any error, STOP immediately, record the
-- failing statement, and inspect actual schema. Do not rerun this file blindly.
-- This file deliberately does NOT insert the Laravel migration record.

USE `logistics_system`;

SET @vip051_now = UTC_TIMESTAMP();

CREATE TABLE `vip_tiers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(30) NOT NULL,
  `name` VARCHAR(50) NOT NULL,
  `priority` SMALLINT UNSIGNED NOT NULL,
  `minimum_spend_vnd` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `base_deposit_percent` DECIMAL(5,2) NULL,
  `credit_limit_vnd` BIGINT UNSIGNED NULL,
  `deposit_policy_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `is_default` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `updated_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `vip_tiers`
  ADD CONSTRAINT `vip_tiers_updated_by_foreign`
  FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
ALTER TABLE `vip_tiers`
  ADD INDEX `vip_tiers_is_active_minimum_spend_vnd_index` (`is_active`, `minimum_spend_vnd`);
ALTER TABLE `vip_tiers` ADD UNIQUE `vip_tiers_code_unique` (`code`);
ALTER TABLE `vip_tiers` ADD UNIQUE `vip_tiers_name_unique` (`name`);
ALTER TABLE `vip_tiers` ADD UNIQUE `vip_tiers_priority_unique` (`priority`);

INSERT INTO `vip_tiers`
  (`code`, `name`, `priority`, `minimum_spend_vnd`, `base_deposit_percent`,
   `credit_limit_vnd`, `deposit_policy_enabled`, `is_default`, `is_active`,
   `updated_by`, `created_at`, `updated_at`)
VALUES
  ('bronze', 'Bronze', 10, 0,         80.00, NULL, 0, 1, 1, NULL, @vip051_now, @vip051_now),
  ('silver', 'Silver', 20, 10000000,  70.00, NULL, 0, 0, 1, NULL, @vip051_now, @vip051_now),
  ('gold', 'Gold', 30, 50000000,      60.00, NULL, 0, 0, 1, NULL, @vip051_now, @vip051_now),
  ('platinum', 'Platinum', 40, 150000000, 50.00, NULL, 0, 0, 1, NULL, @vip051_now, @vip051_now);

ALTER TABLE `customers`
  ADD `vip_tier_id` BIGINT UNSIGNED NULL AFTER `vip_group`,
  ADD `vip_qualified_spend_vnd` BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER `vip_tier_id`;
ALTER TABLE `customers`
  ADD CONSTRAINT `customers_vip_tier_id_foreign`
  FOREIGN KEY (`vip_tier_id`) REFERENCES `vip_tiers` (`id`) ON DELETE SET NULL;
ALTER TABLE `customers`
  ADD INDEX `customers_vip_tier_id_vip_qualified_spend_vnd_index`
  (`vip_tier_id`, `vip_qualified_spend_vnd`);

CREATE TABLE `customer_vip_spend_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id` BIGINT UNSIGNED NOT NULL,
  `source_type` VARCHAR(40) NOT NULL,
  `source_id` BIGINT UNSIGNED NOT NULL,
  `event_type` VARCHAR(40) NOT NULL,
  `amount_vnd` BIGINT NOT NULL,
  `occurred_at` TIMESTAMP NOT NULL,
  `metadata` JSON NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `customer_vip_spend_events`
  ADD CONSTRAINT `customer_vip_spend_events_customer_id_foreign`
  FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT;
ALTER TABLE `customer_vip_spend_events`
  ADD CONSTRAINT `customer_vip_spend_events_created_by_foreign`
  FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
ALTER TABLE `customer_vip_spend_events`
  ADD UNIQUE `vip_spend_source_event_unique` (`source_type`, `source_id`, `event_type`);
ALTER TABLE `customer_vip_spend_events`
  ADD INDEX `customer_vip_spend_events_customer_id_occurred_at_index` (`customer_id`, `occurred_at`);

CREATE TABLE `customer_vip_histories` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id` BIGINT UNSIGNED NOT NULL,
  `from_vip_tier_id` BIGINT UNSIGNED NULL,
  `to_vip_tier_id` BIGINT UNSIGNED NULL,
  `change_type` VARCHAR(30) NOT NULL,
  `qualified_spend_vnd` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `reason` TEXT NOT NULL,
  `changed_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `customer_vip_histories`
  ADD CONSTRAINT `customer_vip_histories_customer_id_foreign`
  FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT;
ALTER TABLE `customer_vip_histories`
  ADD CONSTRAINT `customer_vip_histories_from_vip_tier_id_foreign`
  FOREIGN KEY (`from_vip_tier_id`) REFERENCES `vip_tiers` (`id`) ON DELETE SET NULL;
ALTER TABLE `customer_vip_histories`
  ADD CONSTRAINT `customer_vip_histories_to_vip_tier_id_foreign`
  FOREIGN KEY (`to_vip_tier_id`) REFERENCES `vip_tiers` (`id`) ON DELETE SET NULL;
ALTER TABLE `customer_vip_histories`
  ADD CONSTRAINT `customer_vip_histories_changed_by_foreign`
  FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
ALTER TABLE `customer_vip_histories`
  ADD INDEX `customer_vip_histories_customer_id_created_at_index` (`customer_id`, `created_at`);

CREATE TABLE `risk_deposit_policies` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(30) NOT NULL,
  `name` VARCHAR(50) NOT NULL,
  `priority` SMALLINT UNSIGNED NOT NULL,
  `minimum_deposit_percent` DECIMAL(5,2) NULL,
  `requires_manager_approval` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `updated_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `risk_deposit_policies`
  ADD CONSTRAINT `risk_deposit_policies_updated_by_foreign`
  FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
ALTER TABLE `risk_deposit_policies` ADD UNIQUE `risk_deposit_policies_code_unique` (`code`);
ALTER TABLE `risk_deposit_policies` ADD UNIQUE `risk_deposit_policies_name_unique` (`name`);
ALTER TABLE `risk_deposit_policies` ADD UNIQUE `risk_deposit_policies_priority_unique` (`priority`);

INSERT INTO `risk_deposit_policies`
  (`code`, `name`, `priority`, `minimum_deposit_percent`,
   `requires_manager_approval`, `is_active`, `updated_by`, `created_at`, `updated_at`)
VALUES
  ('low', 'Thấp', 10, NULL, 0, 1, NULL, @vip051_now, @vip051_now),
  ('medium', 'Trung bình', 20, NULL, 0, 1, NULL, @vip051_now, @vip051_now),
  ('high', 'Cao', 30, NULL, 0, 1, NULL, @vip051_now, @vip051_now),
  ('special', 'Đặc biệt', 40, NULL, 1, 1, NULL, @vip051_now, @vip051_now);

CREATE TABLE `order_deposit_policy_snapshots` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT UNSIGNED NOT NULL,
  `customer_id` BIGINT UNSIGNED NOT NULL,
  `vip_tier_id` BIGINT UNSIGNED NULL,
  `vip_code` VARCHAR(30) NULL,
  `vip_name` VARCHAR(50) NULL,
  `qualified_spend_vnd` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `vip_deposit_percent` DECIMAL(5,2) NULL,
  `risk_deposit_policy_id` BIGINT UNSIGNED NULL,
  `risk_code` VARCHAR(30) NOT NULL,
  `risk_name` VARCHAR(50) NOT NULL,
  `risk_reason` TEXT NOT NULL,
  `risk_minimum_percent` DECIMAL(5,2) NULL,
  `capital_minimum_percent` DECIMAL(5,2) NULL,
  `base_amount_vnd` BIGINT UNSIGNED NOT NULL,
  `recommended_percent` DECIMAL(5,2) NOT NULL,
  `final_percent` DECIMAL(5,2) NOT NULL,
  `deposit_waived` TINYINT(1) NOT NULL DEFAULT 0,
  `is_exception` TINYINT(1) NOT NULL DEFAULT 0,
  `exception_reason` TEXT NULL,
  `assessed_by` BIGINT UNSIGNED NOT NULL,
  `approved_by` BIGINT UNSIGNED NULL,
  `assessed_at` TIMESTAMP NOT NULL,
  `approved_at` TIMESTAMP NULL,
  `voucher_issued_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `order_deposit_policy_snapshots`
  ADD CONSTRAINT `order_deposit_policy_snapshots_order_id_foreign`
  FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE RESTRICT;
ALTER TABLE `order_deposit_policy_snapshots`
  ADD CONSTRAINT `order_deposit_policy_snapshots_customer_id_foreign`
  FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT;
ALTER TABLE `order_deposit_policy_snapshots`
  ADD CONSTRAINT `order_deposit_policy_snapshots_vip_tier_id_foreign`
  FOREIGN KEY (`vip_tier_id`) REFERENCES `vip_tiers` (`id`) ON DELETE SET NULL;
ALTER TABLE `order_deposit_policy_snapshots`
  ADD CONSTRAINT `order_deposit_policy_snapshots_risk_deposit_policy_id_foreign`
  FOREIGN KEY (`risk_deposit_policy_id`) REFERENCES `risk_deposit_policies` (`id`) ON DELETE SET NULL;
ALTER TABLE `order_deposit_policy_snapshots`
  ADD CONSTRAINT `order_deposit_policy_snapshots_assessed_by_foreign`
  FOREIGN KEY (`assessed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT;
ALTER TABLE `order_deposit_policy_snapshots`
  ADD CONSTRAINT `order_deposit_policy_snapshots_approved_by_foreign`
  FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
ALTER TABLE `order_deposit_policy_snapshots`
  ADD UNIQUE `order_deposit_policy_snapshots_order_id_unique` (`order_id`);

-- End of schema/seed phase. STOP here.
-- Do not manually insert into migrations from this file.
-- Open and execute 03_heidisql_finalize_migration.sql only after this file
-- completed without any error.

