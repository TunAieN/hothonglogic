# PR #16 browser smoke checklist

Status: **NOT TESTED**. Computer Use stopped because it could not establish the current browser URL with enough confidence to satisfy URL-policy enforcement. Do not mark an item PASS without observing it on an isolated QA environment.

## Environment verification (2026-11-17)

- No Customer Web QA URL or Backend QA URL is configured in the repository or the available local Customer Web environment.
- No process was listening locally on ports 3311, 5173, 5174 or 8000 when the environment was checked.
- The available local Laravel environment points to the protected production endpoint on port 3310. It was not opened in a browser and no request, migration, test or write was sent to it.
- The available Customer Web local override disables demo mode, but that alone does not establish a safe QA backend.
- Therefore the effective database identity, QA database grants, CORS, Sanctum stateful domains, session cookie scope, CSRF behavior and email/reset delivery cannot be verified end to end. All browser rows remain **NOT TESTED**.

## Preconditions

- Use only the approved QA database endpoint `127.0.0.1:3311` with the restricted QA user and explicit test database.
- Confirm the effective Laravel connection before any write. Never fall back to ports 3306 or 3310.
- Use synthetic QA customer and Admin accounts. Do not reuse production credentials, cookies, tokens, or customer data.
- Keep `BUSINESS_WRITES_ENABLED` and `FINANCIAL_WRITES_ENABLED` scoped to the isolated QA runtime.
- Capture browser console and redacted network status codes; never capture passwords, cookies, CSRF values, bearer tokens, or reset tokens.

## Customer Authentication

| Test | Status | Expected result |
| --- | --- | --- |
| Register with valid synthetic data | NOT TESTED | CSRF cookie is obtained; account is created only in QA; response clearly states whether email verification is required. |
| Register with duplicate/linked identity | NOT TESTED | Existing customer is not silently linked; UI shows the review-required response. |
| Login | NOT TESTED | Session cookie is established; customer is redirected only to an allowed `/tai-khoan` path. |
| CustomerMe/session restoration | NOT TESTED | Reload restores the same customer principal without an extra login or a blank screen. |
| Logout | NOT TESTED | Server invalidates the customer session; a subsequent CustomerMe request is rejected. |
| CSRF rejection | NOT TESTED | A state-changing request without a valid CSRF handshake is rejected and creates no data. |
| Email verification disabled | NOT TESTED | Registration/login follow the explicit disabled-mode contract without a fake “email sent” message. |
| Forgot/reset password | NOT TESTED | Generic forgot response prevents enumeration; valid QA reset changes only the QA account and revokes old sessions. |
| Locked/inactive customer | NOT TESTED | Login and authenticated endpoints reject the account without creating a usable session or leaking account state. |

## Customer purchase portal

| Test | Status | Expected result |
| --- | --- | --- |
| Add a cart item | NOT TESTED | Item persists under the signed-in `customer_id` only and survives reload. |
| Edit cart quantity | NOT TESTED | Quantity and calculated display update once, persist after reload, and never affect another customer. |
| Save and edit a draft | NOT TESTED | Draft persists, item data remains intact, and another customer cannot read or modify it. |
| Restore a draft | NOT TESTED | Reopening a saved draft restores all manually entered fields without creating an order. |
| Submit a purchase request | NOT TESTED | Exactly one QA order is created; retry/idempotency does not duplicate it. |
| Orders list and filters | NOT TESTED | Only the current customer's orders appear; loading terminates with data, empty, or error state. |
| Order detail and history | NOT TESTED | Direct IDs belonging to another customer return not-found/forbidden without leaking data. |
| API failure and retry | NOT TESTED | UI displays a recoverable error, keeps entered data, and never remains blank or indefinitely loading. |
| Product auto-fill success | NOT TESTED | Taobao/Tmall/1688 link remains intact; returned metadata/SKU is shown without inventing missing fields. |
| Product auto-fill failure | NOT TESTED | Manually entered name, link, price, variant and quantity are preserved. |
| Product identifiers | NOT TESTED | Product ID and SKU ID are extracted only from supported source data and stay associated with the original URL. |
| Product optional metadata | NOT TESTED | Name, image, CNY price, color and size appear only when supplied by the source; absent fields remain explicitly absent. |

## Responsive and visual checks

| Viewport | Status | Expected result |
| --- | --- | --- |
| Desktop 1440×900 | NOT TESTED | Navigation, forms, tables, notices and retry controls are visible without overlap. |
| Tablet 768×1024 | NOT TESTED | Portal navigation and forms remain usable without horizontal page overflow. |
| Mobile 390×844 | NOT TESTED | Inputs and actions remain reachable; order/cart content uses mobile layout; no clipped dialogs. |
| Keyboard-only | NOT TESTED | Visible focus, logical tab order, labels and error announcements work on auth and purchase pages. |

## Admin

| Test | Status | Expected result |
| --- | --- | --- |
| Admin login | NOT TESTED | GraphQL login returns an Admin token and principal only; no Customer session is created. |
| Admin logout | NOT TESTED | Server deletes exactly the current access token before the client clears local credentials. |
| Other Admin session | NOT TESTED | Logging out one session does not revoke unrelated tokens. |
| Existing logistics read flows | NOT TESTED | Orders, packages, warehouse tasks and payment-voucher pages still load under existing permissions. |
| Unauthorized mutation | NOT TESTED | Missing permission or write lock blocks the mutation without changing QA data. |

## Extension

| Test | Status | Expected result |
| --- | --- | --- |
| Extension login | NOT TESTED | Token is stored only after successful Admin GraphQL authentication. |
| Extension logout | NOT TESTED | Server confirms `logout=true` before local token/session removal. |
| Logout network failure | NOT TESTED | Extension retains the local credential and reports failure instead of claiming a safe logout. |
| Existing logistics helpers | NOT TESTED | Customer loading, product extraction and external-order navigation continue to work on QA. |

## Evidence required for PASS

- QA environment identifier and effective non-production database identity.
- Test time and browser/extension versions.
- Redacted request status sequence and observed UI result.
- Before/after QA record or token counts where relevant, without credential/token values.
- Tester name and explicit PASS/FAIL for every row exercised.
