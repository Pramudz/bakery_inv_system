# Collection and refund transaction recovery

## Why this exists

A lost HTTP response after COMMIT leaves the browser unsure whether a collection or refund posted. The previous collection and refund pages generated a fresh UUID after a refresh, allowing a second partial payment or stock-return refund. The existing POS Finalize page already retains its checkout UUID in a tenant, user and location scoped localStorage draft. Its backend binds the key to one invoice and checks the checkout payload. Collections and refunds now follow that request-identity pattern while retaining their own posting services and business rules.

## Request lifecycle

1. The cashier confirms the amount, method, channel, reference and, for refunds, lines, quantities, stock-return choices and payout.
2. The page creates an independent UUID for the collection or refund. It saves the exact payload and tenant, user, invoice, location and available register/cashier context in localStorage **before** POST.
3. The page sends that saved payload. On a normal response it reads the outcome by original key, compares the returned financial details and session IDs to the saved request, shows the receipt, refreshes history and invoice data, and removes the saved intent.
4. On a timeout, connection error or uncertain response, the intent remains. The page asks the server for the outcome. A committed result is displayed without reposting. A NOT FOUND result leaves the original UUID and payload available for a controlled retry; it does not prove the first request can no longer commit.
5. On refresh or navigation back to the page, every unresolved intent for the signed-in tenant and user is restored and each original key is checked. Another operation of that kind is blocked until reconciliation. A new UUID is made only for a deliberate new collection or refund after the prior intent is resolved.

The browser key format is `erp:transaction-recovery:v1:<collection|refund>:<tenantId>:<userId>:<invoiceId>`. The record contains no auth token or card credentials. Invalid or corrupt records are retained and block submission for manual review. The application does not expire or silently delete unresolved intents. Logout and authentication expiry remove the auth token but retain transaction intents; signing back into the same tenant/user restores them. A different tenant or user does not load another principal's intents.

MySQL BIGINT identifiers can arrive in JSON as strings. The intent writer normalizes invoice, location, register and cashier IDs to safe positive integers before persisting them; refund line IDs are normalized when the page prepares the payload. This is needed so a saved request passes the same validation after browser refresh.

## Server behavior and authorization

- `GET /invoices/:invoiceId/payments/by-key/:collectionUuid` requires authentication and `SALES_PAYMENT_COLLECT`. It verifies tenant and location access and returns the existing payment, method, channel, invoice and balance snapshots. It performs no posting and does not require an open cashier session.
- `GET /invoice-refunds/by-key/:refundUuid?invoiceId=:invoiceId` requires authentication and `SALES_REFUND_CREATE`. It verifies tenant, invoice and location access and returns the committed refund with details and payouts. It performs no posting or stock movement and does not require an open cashier session.
- Collection POST checks a same-key committed payment after locking the invoice and before demanding an active cashier session. It rejects a different user, amount, method, channel or external reference. A new collection still requires a valid cashier/register session. The existing invoice/key uniqueness constraint and transaction remain in force.
- Refund POST retains its tenant/key uniqueness constraint, transaction, invoice lock and fingerprint check. A same-key request with changed material refund data returns a conflict; a valid same-key retry returns the existing refund before checking the cashier session. New cash payouts still require a valid session.

Historical checkout payments with a NULL `collection_key` and the legacy NULL `refund_key` remain valid. Neither column is made NOT NULL. **No migration is required or included.**

## Operator recovery

When a response is lost, leave the page open or reopen Pending Payments / Invoice Correction after signing in as the same tenant and user. Select **Verify status**. If the original transaction appears, use that receipt and verify invoice history, balance and, for a refund, payout and stock return. If the outcome remains unknown, select **Retry original request** only while the original saved intent is shown. The retry submits the original key and payload. The UI distinguishes validation rejection, authorization failure, key conflict, network loss and temporary server contention while retaining the intent until the outcome is known. If the cashier session closed, an already committed result can still be read; an uncommitted request cannot be newly posted until session authorization is restored. Do not change the saved request's session or financial data during recovery.

If browser storage is unavailable, damaged or cleared, stop new entry and reconcile the invoice's payment/refund history, register movements and inventory ledger with an authorized manager. The server cannot infer that two equal-amount, different-key operations represent the same intention: equal-value separate partial payments and refunds are legitimate. Without the original UUID or a separate server-side intent protocol, automatic cross-device or cleared-storage recovery is impossible. An unresolved record may be removed only after authoritative transaction reconciliation using the original key and financial records; the UI deliberately provides no casual discard action. A confirmed validation rejection may therefore require assisted reconciliation before a corrected new request is submitted.

The Web Locks API serializes submission setup among tabs that support it. Every tab also rereads scoped storage before creating a key. Browser storage events update the warning in other tabs. These are same-browser protections; separate devices and browsers do not share storage. Keep the original key for any manual retry. The existing database constraints enforce once-only posting for concurrent same-key requests, while an intentional new key is a separate business operation. Cross-invoice simultaneous reuse of a collection UUID is not protected by a tenant-global unique index; clients generate random UUIDs and the service rejects sequential reuse. A stronger global guarantee would require a compatible constraint or server intent protocol after a separate migration review.

## Disposable database verification

Only use `dev_erp_product_import_test`, confirm `SELECT DATABASE()` matches exactly before setup, take and verify a fresh backup, and create dedicated test tenants and references. Do not use audit invoices 64/67 or payment/refund rows 67–68/12–13. For each operation, save the intent, call POST through a local HTTP harness that destroys the response after the service commits, restore the saved intent as after refresh, call the outcome service, and retry the same key. Assert one payment or refund, one payout and stock return, correct invoice balance, inventory balance/WAVG and ledger, and appropriate register attribution. Then post a separate valid operation with a new key to confirm that equal amounts are allowed. Inject a late pre-COMMIT exception in the refund test to verify rollback. This test harness was removed after recording evidence; do not put fault injection in production code. The harness exercised the real TypeORM services and MySQL but was **not** a complete Nest HTTP authentication test. Controller permission metadata and service tenant/location checks are covered by unit tests; a real login/permission HTTP test remains a manual acceptance step.

The 2026-10-10 pretest dump is `C:\Users\pramu\AppData\Local\Temp\prosinc-recovery-pretest-1791618768288.sql` (1,465,339 bytes; SHA-256 `ae53dbbd2731b217e05d7b97807cf054938e8c47ffc99b2a197ee30702754397`). It contains 87 `CREATE TABLE` statements. The dump was checked structurally but was not restored into a second database during this run. Keep it until acceptance testing is complete.

### Test-data manifest and actual results

| Purpose | Tenant | Invoice | Payment/refund IDs | Result |
| --- | ---: | ---: | --- | --- |
| First collection lost-response run | 235 | 68 | payments 72, 73 | Original key produced payment 72 once; deliberate second operation produced payment 73. Balance after original: LKR 3,000; final: LKR 1,000. |
| First refund lost-response run | 236 | 69 | refunds 15, 16 | Original key produced refund 15 once, one LKR 20 payout, one two-unit return ledger row; deliberate second operation produced refund 16. |
| Concurrent collection rerun | 237 | 70 | payments 75, 76 | Original key produced payment 75 once despite lost response; two concurrent calls with a new shared key both returned payment 76. Two payment rows total; final balance LKR 1,000. |
| Concurrent refund rerun | 238 | 71 | refunds 18, 19 | Original key produced refund 18 once; two concurrent calls with a new shared key both returned refund 19. Original refund: one payout, one cash OUT movement, one two-unit `SALE_RETURN` ledger row; stock 6 → 8 at WAVG LKR 3. |

For tenant 238, the deliberate second distinct refund yielded two valid LKR 20 payouts and two cash OUT movements tied to cashier session 30, with two two-unit return ledger rows. Final stock was 10 at WAVG LKR 3, invoice 71 balance was zero, refundable quantity and refundable payment amount were zero, and the invoice status was `FULLY_REFUNDED`. The controlled exception after the refund stock restore but before COMMIT left no refund or `SALE_RETURN` row and stock remained six. Read-only checks confirmed the old evidence still exists: invoice 64 with payments 67–68 and invoice 67 with refunds 12–13.

A final read-only MySQL check loaded payment 75 and refund 18, used their actual string-valued invoice and session IDs to create and restore browser intents, and resolved both original keys through the services. The restored invoice IDs were numeric 70 and 71; session IDs were 29 and 30. No database rows were changed by this check.

Final regression on 2026-10-10: backend 449/449 tests passed; frontend 76/76 tests passed. Backend Nest build and frontend TypeScript/Vite production build passed. `git diff --check` passed. Vite reported a bundle chunk above 500 kB; this is a size warning. Node reported existing ESM package-type warnings in the frontend test runner. No migration was run.

Run backend and frontend suites, production builds and `git diff --check`. Verify the rendered React pages restore saved intents and make no POST when a committed outcome exists. Also test NOT FOUND followed by a same-key retry and duplicate clicks. Manually exercise cash, card/channel/reference, cheque, session closure, permission denial, tenant and location scope, two tabs, browser refresh and app restart against disposable fixtures before deployment.

### Manual acceptance steps

1. Confirm the active database is exactly `dev_erp_product_import_test`; retain a fresh backup and its checksum. Use a new tenant, product, location, cashier and invoice. Record their IDs and the browser's saved request UUID.
2. Collect LKR 2,000 against a new LKR 5,000 receivable. Drop the local HTTP response only after COMMIT. Refresh the browser and return to Pending Payments. The original payment receipt should appear; the invoice balance should be LKR 3,000 and there should be one collection row for that UUID.
3. Repeat with the response dropped before reaching the server. The page should retain the UUID, show an unresolved warning and permit **Retry original request**. Retry it twice quickly; confirm one committed payment. A lookup returning NOT FOUND must not create a new UUID.
4. Close the cashier session after a committed collection. Verify the saved result remains readable. For a separate uncommitted intent, verify that posting is refused until a valid session exists; its original payload and key must remain visible.
5. On a new paid stock sale, prepare a two-unit cash refund with Return to Stock checked. Drop the response after COMMIT and refresh Invoice Correction. Confirm the original refund receipt, one payout, one cash OUT movement tied to the correct cashier/register, one two-unit `SALE_RETURN` ledger row, and the expected stock/WAVG.
6. Retry the same refund key after closing the session. Confirm lookup and same-key retry return the first refund with no extra payout or stock movement. Change the reason, quantity, method or stock-return choice while reusing its key through an API client; expect a conflict.
7. Create a deliberate second same-value collection and refund with new UUIDs after resolving the first. Confirm each posts as a distinct valid transaction and that invoice balance, refundable quantity and refundable payment amount reconcile.
8. Repeat with card/channel/reference and cheque where configured. Verify the saved payload preserves the original external reference and that a conflicting same-key payload is rejected.
9. Test a user without the required permission, another tenant, and a location-scoped user outside the invoice location. The outcome endpoints must deny access. Test two tabs sharing the same browser profile; neither may replace an unresolved intent with a new UUID.
10. Review the old audit rows without editing them, run the full regression suites and builds, and retain the backup, test-data manifest and SQL reconciliation evidence with the release record.

## Deployment considerations

Deploy backend outcome endpoints and frontend together. Preserve the existing unique constraints. No database migration or data rewrite is part of this change. A shared browser may retain scoped non-sensitive intent metadata after logout; restrict physical access and clear it only after reconciliation. If server and browser snapshots disagree, the UI retains the intent and asks for manager reconciliation. Refund stock returns currently update Inventory Balance and Inventory Ledger through the existing refund posting service; that service does not create Inventory Age Layer rows, so age-layer reconciliation remains an existing inventory design limitation rather than a change made by this recovery work.
