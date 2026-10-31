# Payment domain V2 implementation result

Ngày hoàn tất: 2026-09-08  
Phạm vi: `logistics-backend`, kiểm tra compatibility với `admin-panel` và Chrome extension.

## 1. Kết quả

`payment_vouchers` được thu gọn từ 38 xuống 30 cột vật lý và giữ đúng vai trò aggregate/header. Monetary breakdown nằm ở `payment_voucher_items`; tiền thực nhận nằm ở `payment_transactions`; biến động credit nằm ở `customer_balance_ledgers`; invoice tiếp tục là accounting document.

Target 18–24 cột không được áp dụng máy móc: 30 cột là kết quả audit vì bank snapshots, cancellation lifecycle, idempotency, ownership và audit fields đều thuộc voucher header. Không tạo thêm business table.

Phương án payment total được chọn là option B:

- `payment_transactions` có status `confirmed` là source of truth.
- `payment_vouchers.paid_amount` là materialized cache, được cập nhật atomic trong transaction.
- `remaining_amount` được tính `MAX(total_amount - paid_amount, 0)` và không còn là cột vật lý.

Bank account snapshot tiếp tục nằm trực tiếp trên voucher để bảo toàn lịch sử chứng từ.

## 2. Files created

- `docs/database/payment-domain-v2-audit.md`
- `docs/database/payment-domain-v2-result.md`
- `logistics-backend/app/Console/Commands/AuditPayments.php`
- `logistics-backend/app/Domain/Payments/Enums/PaymentVoucherStatus.php`
- `logistics-backend/app/Domain/Payments/Enums/PaymentTransactionStatus.php`
- `logistics-backend/app/Domain/Payments/Enums/InvoiceStatus.php`
- `logistics-backend/database/migrations/2026_09_08_000046_expand_payment_voucher_v2_items_and_integrity.php`
- `logistics-backend/database/migrations/2026_09_08_000047_contract_payment_voucher_v2_derived_columns.php`
- `logistics-backend/database/migrations/2026_09_08_000048_retire_empty_legacy_payments_table.php`

## 3. Files modified

- `logistics-backend/app/Models/PaymentVoucher.php`
- `logistics-backend/app/Models/PaymentVoucherItem.php`
- `logistics-backend/app/Models/PaymentTransaction.php`
- `logistics-backend/app/Models/Invoice.php`
- `logistics-backend/app/Services/Payments/PaymentVoucherService.php`
- `logistics-backend/app/Services/Reports/RevenueReportService.php`
- `logistics-backend/app/Services/Shipping/ShippingTaskService.php`
- `logistics-backend/app/Services/Shipping/ShippingTaskGhnPreviewService.php`
- `logistics-backend/tests/Feature/PaymentVoucherAmountsTest.php`
- `logistics-backend/tests/Feature/ShippingTaskWorkflowTest.php`
- `logistics-backend/tests/Unit/PaymentVoucherMigrationSafetyTest.php`

Không cần sửa source của `admin-panel`, GraphQL schema hoặc Chrome extension. `.gitignore` và `logistics-backend/database/snapshots/` là thay đổi có sẵn của người dùng, không thuộc implementation này.

## 4. Migrations added

### `000046` — expand, backfill, integrity

- Kiểm tra schema đầu vào và orphan references trước khi thay đổi dữ liệu.
- Backfill item metadata và các adjustment item theo chunk/transaction.
- Chuyển `deposit_applied` và `customer_credit_applied` thành negative voucher items.
- Chuẩn hóa legacy surcharge references.
- Với 8 `shipping_rate_detail_id` lịch sử không còn target: chỉ bỏ provenance ID sau khi xác nhận pricing snapshot đầy đủ; amount lịch sử không bị thay đổi.
- Thêm các FK còn thiếu một cách idempotent.

### `000047` — guarded contract

- Chạy `assertReadyForCleanup()` trước khi drop.
- Xác nhận totals, transaction cache, remaining, metadata, references, snapshots và toàn bộ FK V2.
- Chỉ drop 8 cột đã chứng minh là duplicate/derived.
- `down()` không giả lập phục hồi dữ liệu lịch sử đã normalize.

### `000048` — retire legacy `payments`

- Tách riêng khỏi contract voucher.
- Chỉ drop khi bảng tồn tại và có đúng 0 row; nếu không migration abort.
- Repository dependency test bảo vệ khỏi việc tái sử dụng bảng legacy.

Không migration cũ nào bị sửa và không dùng `migrate:fresh`, `migrate:reset` hay destructive reset.

## 5. Columns

### Kept (30)

```text
id, voucher_code, request_uuid, voucher_type,
customer_id, order_id, vn_warehouse_id,
currency, exchange_rate,
subtotal, discount_amount, total_amount, paid_amount,
status, payment_method_expected, payment_account_id,
bank_name_snapshot, bank_code_snapshot,
bank_account_number_snapshot, bank_account_holder_snapshot,
bank_branch_name_snapshot, transfer_content,
created_by, note,
cancelled_by, cancelled_at, cancelled_reason, expires_at,
created_at, updated_at
```

### Migrated and removed (8)

| Column | Destination/source after contract |
|---|---|
| `payment_method` | Derived from actual transactions; expected method remains on header. |
| `base_amount_cny` | Voucher item metadata. |
| `base_amount_vnd` | `order_amount` item/header component. |
| `deposit_percent` | Order policy/item metadata; not voucher ownership. |
| `deposit_applied` | Negative `deposit_applied` item. |
| `customer_credit_applied` | Negative `customer_credit` item plus ledger history. |
| `paid_at` | Derived from confirmed transactions. |
| `remaining_amount` | Derived from `total_amount` and cached `paid_amount`. |

Existing GraphQL fields with these names remain readable through model accessors.

## 6. Integrity changes

Added missing foreign keys:

- `vn_packages.payment_voucher_id` → `payment_vouchers.id`, `SET NULL`.
- `payment_voucher_packages.shipping_rate_id` → `shipping_rates.id`, `SET NULL`.
- `payment_voucher_packages.shipping_rate_detail_id` → `shipping_rate_details.id`, `SET NULL`.
- `invoices.payment_voucher_id` → `payment_vouchers.id`, `SET NULL`.
- `invoice_items.payment_voucher_package_id` → `payment_voucher_packages.id`, `SET NULL`.

Existing indexes and valid FKs are retained. `vn_packages.payment_voucher_id` currently means the active voucher lock; it is not renamed in this compatibility release.

## 7. Business rules and compatibility

- Voucher `subtotal` reconciles with component items; discount/deposit/credit are adjustments.
- `paid_amount` equals the complete sum of confirmed transactions, including overpayment; displayed remaining is clamped to zero.
- Cancelled and paid vouchers reject invalid new payments.
- Confirm/cancel/invoice/credit flows remain multi-table transactions.
- Customer balance rows are locked before credit changes.
- Invoice paid amount is capped at invoice total while voucher cache continues reflecting all confirmed receipts.
- PHP backed enums centralize voucher, transaction and invoice statuses; old model constants and public strings remain compatible.
- Raw shipping queries no longer depend on the removed physical `remaining_amount` column.
- Invoice item writes support both historical expanded schemas and the fresh normalized schema during rollout.

Read-only reconciliation command:

```shell
php artisan payments:audit
php artisan payments:audit --voucher=123 --verbose
```

It reports voucher count, subtotal/payment/remaining mismatches, orphan items/transactions, invalid invoice and customer/order links, item reference issues, snapshot/status issues, then exits with PASS or FAIL. It never repairs data.

## 8. Tests and verification

Coverage includes deposit/shipping voucher creation, item totals, partial/full/multiple/overpayment, cancellation, invalid payment, invoice generation, customer credit, deposit application, account snapshots, historical compatibility, migration guards/backfill, audit output, GraphQL compatibility, shipping workflow and legacy dependency checks.

Commands and results:

| Command/check | Result |
|---|---|
| Targeted backend tests on pre-contract schema | 61 passed, 390 assertions |
| All migrations on an empty temporary database | PASS; 30 voucher columns, required FKs, no `payments` table |
| `payments:audit --verbose` after historical-clone upgrade | PASS; 19 vouchers, all mismatch/orphan counters = 0 |
| Full backend suite on post-contract schema | 131 passed, 774 assertions |
| `vendor/bin/pint --test` | PASS |
| `npm run build` in `admin-panel` | PASS; 6,144 modules built |
| `git diff --check` | PASS for implementation; only an existing `.gitignore` line-ending warning |

The historical clone was upgraded by running only new migrations `000046` → `000047` → `000048`. The source/local database was not migrated or mutated.

## 9. Production rollout

Recommended sequence:

1. Take a verified database backup and rehearse on a production-sized clone.
2. Run `php artisan payments:audit --verbose` before deployment and resolve any reported issue.
3. Deploy code and run migrations sequentially with stop-on-error; do not force past a preflight exception.
4. Run `php artisan payments:audit --verbose` again and retain its output with deployment evidence.
5. Monitor payment creation, confirmation, invoices, credit ledger and shipping release during the rollout window.

## 10. Remaining technical debt

- Production data still needs backup, staging rehearsal, rollout scheduling and post-migration audit; this task deliberately did not migrate the source database.
- Rename of `vn_packages.payment_voucher_id` to an explicit active-lock name is deferred because it would require a coordinated API/query rollout.
- DECIMAL conventions are documented but not applied globally; exchange-rate precision and older amount definitions require a separate pricing/money audit.
- The local historical database has older migration-history/table-state discrepancies outside these three migrations; they must be reconciled separately rather than hidden by this refactor.
- Status definitions outside voucher/transaction/invoice remain mixed ENUM/VARCHAR and are outside scope.
- `payment-domains:verify` remains for backward compatibility; `payments:audit` is the new canonical consistency check.
