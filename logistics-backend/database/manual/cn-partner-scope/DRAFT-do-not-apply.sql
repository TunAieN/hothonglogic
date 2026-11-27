-- Review draft only. This file is outside the migration runner.
-- Production approval, backup, and a verified scoped API release are required
-- before activating any partner user. The DDL alone grants no access.
-- Test on a restored clone first and back up orders/tracking, users, roles and
-- China warehouses. Schedule the ALTER after checking its metadata-lock impact.

CREATE TABLE cn_warehouse_user_assignments (
    user_id BIGINT UNSIGNED NOT NULL,
    warehouse_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, warehouse_id),
    KEY cn_warehouse_assignment_warehouse_idx (warehouse_id),
    CONSTRAINT cn_warehouse_assignment_user_fk
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT cn_warehouse_assignment_warehouse_fk
        FOREIGN KEY (warehouse_id) REFERENCES cn_warehouses(id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE order_trackings
    ADD COLUMN expected_cn_warehouse_id BIGINT UNSIGNED NULL,
    ADD INDEX order_trackings_expected_cn_warehouse_idx (expected_cn_warehouse_id),
    ADD CONSTRAINT order_trackings_expected_cn_warehouse_fk
        FOREIGN KEY (expected_cn_warehouse_id) REFERENCES cn_warehouses(id) ON DELETE SET NULL;

-- Historical rows retain NULL and stay invisible to partner users until an
-- internal operator verifies an expected warehouse. No backfill by inference.
-- Partner capabilities should be separate from the existing internal GraphQL
-- permissions. Use slim response types (no Order/Customer/CnPackage graph),
-- active user + assignment + operation permission checks for every root field,
-- assigned warehouse predicates for all IDs, and the existing receipt/inspection
-- transactions after authorization. Keep final purchase verification internal.
-- Before rollback: disable partner capability grants and export the assignments
-- and expected-warehouse values. Remove the FK, index and column, then remove the
-- assignment table after confirming the backup can be restored.
