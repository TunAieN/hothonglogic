# Payment domain V2 audit

Ngày audit: 2026-09-08  
Phạm vi: `logistics-backend`, `admin-panel`, `extension-src`, schema dump hiện có và database local.  
Nguyên tắc: migrations là schema history; không sửa migration đã chạy, không `migrate:fresh`, không xóa field chưa chứng minh được ownership và compatibility.

## 1. Current architecture

Luồng production hiện tại:

```text
Order ─┬─ PaymentVoucher(deposit) ─ PaymentTransaction ─ Invoice(deposit)
       │
       └─ CnPackage ─ VnPackage ─ PaymentVoucherPackage
                                  └─ PaymentVoucher(shipping)
                                     ├─ PaymentVoucherItem
                                     ├─ PaymentTransaction
                                     ├─ CustomerBalanceLedger
                                     ├─ DeliveryRequest ─ DeliveryAddress
                                     │                  └─ Shipment ─ ShipmentTrackingEvent
                                     └─ Invoice ─ InvoiceItem
```

Các write path chính nằm trong `PaymentVoucherService` và đã dùng transaction cho create, confirm, cancel và issue invoice. GraphQL resolver chủ yếu delegate vào service. Frontend đọc toàn bộ contract cũ qua `VOUCHER_FIELDS`; Chrome extension không có payment read/write path.

Lịch sử schema quan trọng:

- `000019`: tạo voucher/package/surcharge/transaction/ledger và gắn trạng thái payment lên `vn_packages`.
- `000021`: tạo `payment_accounts` và snapshot tài khoản nhận tiền trên voucher.
- `000025`/`000026`: thêm order deposit snapshot và voucher deposit snapshot.
- `000027`/`000028`: nối invoice với deposit voucher/transaction và cho phép invoice item không gắn package.
- `000041`: thêm delivery fields tạm trên voucher.
- `000042`: expand sang item/delivery/shipment domains và backfill.
- `000043`: reconcile item subtotal lịch sử.
- `000044`: contract các delivery/fee legacy columns sau preflight.

Database local sau `000044` có 38 cột trên `payment_vouchers`; command `payment-domains:verify` hiện PASS với 0 voucher thiếu item/delivery request và 0 subtotal mismatch. Dump cho thấy 19 voucher, 31 item, 16 transaction và bảng legacy `payments` có 0 row.

## 2. `payment_vouchers` column inventory

Ký hiệu: KEEP = header sở hữu; MOVE = chuyển source sang domain khác; DERIVED = compatibility accessor/query; SNAPSHOT = lịch sử phải giữ; LEGACY = không còn production ownership; UNKNOWN = chưa đủ chứng cứ (không có column nào bị xếp UNKNOWN trong đợt contract đề xuất).

| Column | Purpose; read/write locations | Owner / source of truth | Nature | Class | V2 destination and removal risk |
|---|---|---|---|---|---|
| `id` | PK; toàn bộ relations, GraphQL, services, reports | Voucher | persisted | KEEP | Giữ. Rủi ro xóa: critical. |
| `voucher_code` | Mã public; service tạo, UI/report/invoice đọc | Voucher | persisted | KEEP | Giữ unique. |
| `request_uuid` | Idempotency shipping create; service đọc/ghi | Voucher | persisted | KEEP | Giữ unique nullable. |
| `voucher_type` | Phân biệt `deposit`/`shipping`; service, order relation, invoice, report, UI | Voucher | persisted | KEEP | Giữ public strings. |
| `customer_id` | Customer của chứng từ; service, filters, report, ledger | Voucher, phải khớp order/packages | persisted FK | KEEP | Giữ RESTRICT. |
| `order_id` | Deposit voucher gắn một order; service/order/invoice/UI | Voucher for deposit only | persisted FK | KEEP | Giữ nullable, SET NULL để bảo toàn chứng từ. Shipping multi-order dùng pivot package. |
| `vn_warehouse_id` | Kho phát hành/thu hàng; filters và revenue | Voucher | persisted FK | KEEP | Giữ nullable, SET NULL. |
| `created_by` | Audit actor; service/UI | Voucher | persisted FK | KEEP | Giữ nullable, SET NULL. |
| `payment_method_expected` | Phương thức được yêu cầu; create/UI/transaction default | Voucher | persisted policy | KEEP | Giữ; khác phương thức thực tế từng transaction. |
| `payment_method` | Create ghi expected, confirm ghi method cuối; UI đọc | Transaction | duplicated/derived | DERIVED | Drop column; accessor lấy confirmed transaction mới nhất, fallback expected. Rủi ro: multi-method voucher không có một giá trị duy nhất, vì vậy compatibility phải giữ semantics “latest actual”. |
| `payment_account_id` | Live link tới cấu hình tài khoản; service/UI | Voucher selection | persisted FK | KEEP | Giữ SET NULL. Snapshot không phụ thuộc link này. |
| `bank_name_snapshot` | Tài khoản nhận tiền tại thời điểm phát hành; create/UI/transaction default | Voucher historical record | historical | SNAPSHOT | Giữ trực tiếp; tách bảng không tạo lifecycle độc lập và chỉ tăng join. |
| `bank_code_snapshot` | Như trên | Voucher historical record | historical | SNAPSHOT | Giữ. |
| `bank_account_number_snapshot` | Như trên | Voucher historical record | historical | SNAPSHOT | Giữ. |
| `bank_account_holder_snapshot` | Như trên | Voucher historical record | historical | SNAPSHOT | Giữ. |
| `bank_branch_name_snapshot` | Như trên | Voucher historical record | historical | SNAPSHOT | Giữ. |
| `base_amount_cny` | Tổng hàng CNY; deposit UI/invoice và shipping UI đọc; service ghi | Order(s), captured by voucher item metadata | duplicate snapshot | MOVE | Backfill `amount_cny` vào `deposit`/`order_amount` item metadata; accessor giữ GraphQL. Rủi ro: shipping nhiều order có nhiều rate, không được suy ra lại từ một rate. |
| `exchange_rate` | Rate snapshot cho deposit; UI/invoice đọc | Order pricing snapshot | historical context | SNAPSHOT | Giữ nullable ở header cho deposit compatibility; shipping nhiều order không dùng một rate tổng hợp. |
| `base_amount_vnd` | Tổng tiền hàng VND; service/UI/tests/invoice đọc | `order_amount` item(s) | duplicate | MOVE | Drop sau backfill; accessor sum item `order_amount`, deposit lấy metadata `base_amount_vnd`. |
| `deposit_percent` | Policy yêu cầu cọc; create/sync order/UI/invoice đọc | Order; voucher item captures historical request | duplicate snapshot | MOVE | Backfill item metadata; accessor giữ contract. Rủi ro lớn nếu fallback vào live order làm sai lịch sử, nên item metadata là bắt buộc trước drop. |
| `currency` | Currency của voucher totals | Voucher | persisted | KEEP | Giữ (`VND` hiện tại). |
| `transfer_content` | Nội dung khách cần chuyển | Voucher | persisted instruction | KEEP | Giữ. |
| `status` | Workflow voucher; service/UI/shipping/report | Voucher state machine | persisted | KEEP | Giữ strings public; định nghĩa bằng PHP enum. |
| `subtotal` | Gross amount trước adjustment; service/items/reconciliation | Cache tổng component items | persisted aggregate | KEEP | Giữ làm header total; invariant với positive/component items. |
| `discount_amount` | Tổng deposit + credit deductions; service/UI | Cache tổng adjustment items | persisted aggregate | KEEP | Giữ; invariant với `deposit_applied` + `customer_credit` item types. |
| `total_amount` | Số tiền voucher yêu cầu thu | Voucher aggregate, computed from items | persisted aggregate | KEEP | Giữ; invariant `subtotal - discount_amount`. |
| `deposit_applied` | Deposit order đã dùng cho shipping voucher; preview/service/UI/report | Item breakdown + order ledger snapshot | duplicated component | MOVE | Tạo negative item `deposit_applied`; accessor trả trị tuyệt đối. Không đổi public GraphQL field. |
| `customer_credit_applied` | Credit đã dùng; service/UI/ledger | Item breakdown + customer ledger | duplicated component | MOVE | Tạo negative item `customer_credit`; accessor trả trị tuyệt đối. Ledger vẫn là source lịch sử balance. |
| `paid_amount` | Tổng confirmed payment cache; service/UI/invoice/report | `SUM(payment_transactions.amount WHERE confirmed)` | materialized cache | KEEP | Chọn phương án B. Giữ để list/report nhanh; mọi service write cập nhật cùng DB transaction; audit bắt mismatch. Không cap ở total khi có overpayment. |
| `paid_at` | Thời điểm trả đủ; service/UI | confirmed transactions | derived | DERIVED | Drop; accessor lấy `MAX(received_at)` khi paid. |
| `remaining_amount` | Số còn thu; service/UI/shipping | `MAX(total_amount - paid_amount, 0)` | derived | DERIVED | Drop; accessor giữ GraphQL. Đây là cache thứ hai không cần thiết. |
| `note` | Ghi chú cấp chứng từ; service/UI/invoice | Voucher | persisted | KEEP | Giữ. |
| `cancelled_reason` | Audit hủy; service/UI | Voucher workflow | persisted | KEEP | Giữ. |
| `cancelled_by` | Actor hủy | Voucher workflow | persisted FK | KEEP | Giữ SET NULL. |
| `cancelled_at` | Thời điểm hủy; service/order relation | Voucher workflow | persisted | KEEP | Giữ. |
| `expires_at` | Hạn thanh toán deposit; service | Voucher workflow | persisted | KEEP | Giữ. |
| `created_at` | Lịch sử/report/order snapshot | Voucher | persisted | KEEP | Giữ. |
| `updated_at` | Audit/UI | Voucher | persisted | KEEP | Giữ. |

Final proposed contract removes 8 physical columns (`payment_method`, `base_amount_cny`, `base_amount_vnd`, `deposit_percent`, `deposit_applied`, `customer_credit_applied`, `paid_at`, `remaining_amount`) and keeps 30. The count is intentionally above the illustrative 18–24 target because five bank snapshot fields, four cancellation fields, audit fields and `note` all have the same voucher lifecycle and ownership. Moving them to tiny one-to-one tables would be column-count optimization, not domain normalization.

Read/write location summary used for the inventory:

- Backend write paths: `app/Services/Payments/PaymentVoucherService.php`; migration backfills `000042`/`000043`; test fixtures.
- Backend reads: `PaymentVoucher`, `Order`, `VnPackage`, `PaymentVoucherPackage`, `SettledPaymentSummaryService`, `ShippingTaskService`, `ShippingTaskGhnPreviewService`, `RevenueReportService`, `InvoiceResolver`.
- API: `graphql/payments.graphql`, `graphql/invoices.graphql`, `PaymentVoucherResolver`.
- Frontend: `admin-panel/src/pages/payment-vouchers/{api,types,index,show}.ts(x)`, order deposit UI and invoice UI.
- No matching production payment path was found in `extension-src`.

## 3. Problems found

1. Voucher items are source of component detail, but deposit and customer credit deductions remain duplicated only as header columns; this makes item reconciliation incomplete.
2. `paid_amount` and `remaining_amount` are both written caches. The confirmed transactions are already authoritative; a second remaining cache can drift.
3. `payment_method` cannot correctly represent multiple actual transaction methods and duplicates transaction data.
4. `paid_at` duplicates transaction timestamps.
5. `base_amount_*` and `deposit_percent` duplicate order/item facts. `deposit_percent` is order policy, while the voucher only needs an immutable snapshot of the requested amount and supporting metadata.
6. Model money casts and service calculations use PHP float. VND is rounded to integer but the implementation does not make precision policy explicit.
7. Status strings are spread across model constants/services. GraphQL strings must remain stable, but domain enums are missing.
8. Actual schema lacks FKs for `vn_packages.payment_voucher_id`, `payment_voucher_packages.shipping_rate_id`, `payment_voucher_packages.shipping_rate_detail_id`, `invoices.payment_voucher_id`, and `invoice_items.payment_voucher_package_id`. Existing important FKs otherwise have appropriate RESTRICT/SET NULL behavior.
   Historical-clone verification found 8 orphan `shipping_rate_detail_id` values. Their package rows retain `unit_price`, `price_type`, `shipping_fee`, `total_amount`, weights and rate description snapshots. V2 therefore treats these IDs as optional provenance: the migration asserts snapshot completeness, nulls only invalid provenance IDs, then adds SET NULL FKs. It never rewrites the captured price or fee.
9. `vn_packages.payment_voucher_id` duplicates the pivot association, but code proves a separate semantic: it is the current active payment lock used by eligibility/shipping workflows. It should be documented as such. Renaming it now would break broad compatibility; defer to an explicit expand/backfill rename release.
10. Legacy `payments` exists in the real schema with zero rows, but there is no model/resolver/service/frontend production dependency. Retire it only in a separate guarded migration.
11. Existing `payment-domains:verify` is useful but does not meet the requested `payments:audit` contract and misses payment/remaining, orphan, invoice and customer/order checks.

## 4. Source-of-truth matrix

| Concern | Source of truth | Cached/snapshot consumers |
|---|---|---|
| Voucher component detail | `payment_voucher_items` | `subtotal`, `discount_amount`, `total_amount` |
| Required amount | `payment_vouchers.total_amount` reconciled from items | Invoice snapshot |
| Actual cash received | confirmed `payment_transactions` | `payment_vouchers.paid_amount` cache |
| Remaining | formula `max(total_amount - confirmed_paid_amount, 0)` | GraphQL accessor only |
| Deposit policy | `orders.deposit_percent` | voucher item metadata captures historical percent |
| Deposit applied to shipping | `deposit_applied` adjustment item plus order deposit snapshot | GraphQL compatibility accessor |
| Customer credit balance | ordered `customer_balance_ledgers` | latest `balance_after`; voucher adjustment item records application |
| Expected payment method | voucher | actual method is per transaction |
| Bank account now | `payment_accounts` | voucher bank fields are immutable historical snapshot |
| Delivery address | `delivery_addresses` | customer address is only source reference, not historical display source |
| Revenue | issued/confirmed `invoice_items` excluding deposit vouchers | invoice header totals |

## 5. Payment voucher item model

Keep all existing public `item_type` values. Add only:

- `deposit_applied`: negative amount, reference order when determinable.
- `customer_credit`: negative amount, reference voucher/ledger context.

Component invariant:

```text
subtotal        = SUM(amount excluding deposit_applied/customer_credit)
discount_amount = ABS(SUM(deposit_applied/customer_credit amounts))
total_amount    = MAX(subtotal - discount_amount, 0)
```

`legacy_reconciliation` remains a subtotal component even if negative; it is not a discount. This preserves historical totals. Metadata captures `amount_cny`, `base_amount_vnd`, `exchange_rate`, and `deposit_percent` where applicable without changing the public item type contract.

## 6. Proposed V2 schema

`payment_vouchers` remains the aggregate/header with 30 physical columns:

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

No payment snapshot table is added. `payment_voucher_items` owns monetary breakdown; `payment_transactions` owns actual receipts; ledger owns balance movement; delivery tables own address/carrier workflow; invoices own accounting snapshots.

Money convention for touched code/schema:

- VND amount: `DECIMAL(18,0)` for new/changed physical columns; application treats values as integer decimal strings/integers.
- CNY item metadata: decimal string with 2 fraction digits.
- Exchange rate: retain current `DECIMAL(15,4)` in this task to avoid unrelated precision migration; a future `DECIMAL(18,6)` change needs pricing-domain audit.
- Weight: 3 fraction digits.

No broad DECIMAL migration is included in this task.

## 7. FK changes

| Field | Current | V2 action / delete behavior |
|---|---|---|
| `payment_vouchers.payment_account_id` | FK | Keep SET NULL; snapshot survives account deletion. |
| `payment_vouchers.order_id` | FK | Keep SET NULL; voucher history survives order archival/removal. |
| `payment_vouchers.vn_warehouse_id` | FK | Keep SET NULL. |
| `payment_voucher_packages.vn_package_id` | FK | Keep RESTRICT. |
| `payment_voucher_packages.order_id` | FK | Keep SET NULL. |
| `payment_voucher_packages.payment_voucher_id` | FK | Keep CASCADE because rows are aggregate-owned pricing/package snapshots; confirmed transactions still RESTRICT deletion of paid vouchers. |
| `payment_voucher_packages.shipping_rate_id` | index/value only | Add FK SET NULL after orphan preflight; rate snapshot fields remain. |
| `payment_voucher_packages.shipping_rate_detail_id` | index/value only | Add FK SET NULL after orphan preflight. |
| `invoices.payment_voucher_id` | unique index, missing FK in actual historical schema | Add FK SET NULL after orphan preflight. |
| `invoices.payment_transaction_id` | FK | Keep SET NULL. |
| `invoice_items.payment_voucher_package_id` | value only | Add FK SET NULL after orphan preflight. |
| `vn_packages.payment_voucher_id` | active-lock value, missing FK | Add FK SET NULL after orphan preflight. Do not rename in this compatibility release. |

FK creation must be idempotent against deployments whose original conditional migration happened to create the constraint. Migration inspects the database metadata before adding.

## 8. Migration strategy

1. **EXPAND/BACKFILL**: new migration creates adjustment items and enriches item metadata in chunks, deterministically and without touching historical timestamps.
2. **VERIFY**: abort on item/total, transaction/cache, remaining, snapshot, orphan or customer/order mismatch.
3. **INTEGRITY**: add missing FKs only after orphan checks pass.
4. **SWITCH READS/WRITES**: service writes adjustment items, only materializes `paid_amount`, and accessors serve old GraphQL fields.
5. **CONTRACT**: a separate migration with `assertReadyForCleanup()` drops only the eight proven duplicate/derived columns.
6. **LEGACY PAYMENTS**: separate guarded migration, only if table is empty and repository dependency test remains green. Do not combine with voucher contract.

Backfills use `chunkById`, row transactions, decimal/integer operations and update only metadata/inserted rows. They are idempotent via `(voucher, item_type)` existence checks and metadata merge.

## 9. Compatibility plan

- Keep every existing GraphQL field and public status/item strings.
- Eloquent accessors provide `base_amount_cny`, `base_amount_vnd`, `deposit_percent`, `deposit_applied`, `customer_credit_applied`, `payment_method`, `paid_at`, and `remaining_amount` after physical columns disappear.
- Continue eager-loading items/transactions on detail/invoice/shipping flows; list only derives remaining from header cache without extra queries.
- Frontend and extension require no contract rename.
- Add PHP backed enums `PaymentVoucherStatus`, `PaymentTransactionStatus`, and `InvoiceStatus`; keep model constants as compatibility aliases.
- All multi-table payment writes remain inside DB transactions. Direct transaction creation outside the service is test/seeder-only and must not be a production path.

## 10. Invariants and reconciliation

Required checks:

- item subtotal and adjustments reconcile to voucher header totals;
- `paid_amount == SUM(confirmed transactions)`;
- computed remaining is never negative;
- cancelled voucher has no later confirmed transaction and cannot accept a new one;
- invoice customer/voucher/transaction links are consistent;
- voucher customer equals deposit order customer and every package order customer;
- item references resolve for known reference types;
- active package lock points to a voucher whose pivot contains the package;
- bank-transfer voucher retains sufficient account snapshot data;
- all proposed FK targets exist.

Add read-only `php artisan payments:audit [--voucher=ID] [--verbose]` with PASS/FAIL and the requested counters. Keep `payment-domains:verify` as a backward-compatible alias/deprecation wrapper if practical.

## 11. Risk assessment

| Risk | Level | Mitigation |
|---|---|---|
| Losing historical deposit/base snapshots | High | Backfill item metadata; preflight requires metadata before drop; compatibility tests. |
| Header paid cache drift | High | Confirmed transactions authoritative; atomic service update; reconciliation command and tests. |
| Existing orphan IDs blocking FK creation | High | Read-only audit and migration preflight abort; never silently null/delete financial links. |
| GraphQL/frontend break after physical drop | High | Keep schema unchanged; accessors plus GraphQL compatibility tests. |
| Adjustment rows double-counting invoice/revenue | High | Invoice copies all item rows; negative adjustments intentionally reduce accounting total; report sums invoice items. Add invoice invariant tests. |
| Old migration `000044` already contracted delivery columns | Medium | Do not edit it; treat it as history and add only new migrations. |
| Float precision | Medium | VND integer normalization for touched paths; no broad historical rewrite. |
| Renaming `vn_packages.payment_voucher_id` | Medium | Defer rename; document active-lock semantics. |
| Dropping empty `payments` table | Low/Medium | Separate guarded migration and dependency test. |

## 12. Implementation plan selected

Proceed with option B for payment totals: keep `paid_amount` only as a materialized cache, derive remaining. Keep bank snapshots on the voucher (option A). Normalize deposit/credit into items, introduce domain enums, add guarded FKs, implement `payments:audit`, preserve GraphQL, then add focused tests for creation, partial/full/multiple payment, cancellation, invalid payment, invoice, credit/deposit, snapshot history, backfill and command output.
