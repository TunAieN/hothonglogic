# VIP + risk surcharge policy 052

Migration `2026_11_26_000052_add_risk_surcharge_policy.php` adds configuration and immutable snapshot fields for the additive formula:

`final = min(100, VIP base + risk surcharge)`, then any approved absolute risk/capital floor may raise that result.

## Safety state

- Migration 051 is not modified.
- Migration 052 does not enable `deposit_policy_enabled` for any tier.
- Existing orders, vouchers and policy snapshots are not recalculated.
- When a tier remains disabled, the current 70% fallback behavior remains unchanged and no surcharge is added to it.

## Deployment order

1. Confirm all four VIP bases are `60/50/40/30` and all tier policy flags are still disabled.
2. Take and verify the normal database backup/checksum.
3. Run only migration 052 by its explicit path.
4. Verify risk surcharges are `5/10/20/30`, `special.requires_manager_approval = 1`, and all tier policy flags remain disabled.
5. Deploy backend and Admin Panel code.
6. Test preview and confirmation in QA. Do not use a production order for write testing.
7. Obtain final owner approval before enabling any tier.

## Controlled activation (requires final approval)

Use the audited **VIP & chính sách đặt cọc** Admin page. Enable tiers only after confirming:

- Bronze 60%, Silver 50%, Gold 40%, Platinum 30%.
- Low +5, Medium +10, High +20, Special +30 percentage points.
- Special continues to require manager approval.

Expected results:

| VIP | Low | Medium | High | Special |
| --- | ---: | ---: | ---: | ---: |
| Bronze | 65% | 70% | 80% | 90% |
| Silver | 55% | 60% | 70% | 80% |
| Gold | 45% | 50% | 60% | 70% |
| Platinum | 35% | 40% | 50% | 60% |

## Configuration rollback

Disable `deposit_policy_enabled` through the same audited Admin page. New confirmations return to the current fallback behavior; already-issued vouchers retain their saved snapshots and are not recalculated.

Schema rollback is intentionally non-destructive because the added snapshot fields are financial audit records.
