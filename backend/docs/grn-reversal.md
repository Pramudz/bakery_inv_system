# GRN reversal implementation report

Implemented on `feature/grn-reversal`. No application or production database migration was executed. MySQL verification used newly created `grn_reversal_test_<timestamp>_<random>` databases, which were dropped by the test suite after completion.

1. **Existing architecture reused.** NestJS controllers, tenant authentication and permission guards, TypeORM transactions, the existing receipt/PO entities, InventoryBalanceService, InventoryLedgerService, InventoryAgeLayerService, and tenantBusinessClock remain authoritative. The React screen uses TanStack Query, purchasingApi, the existing searchable select, modal, receipt cards, summary and sticky action bar. No additional framework or accounting/return/adjustment entities were added.

2. **Model and migration.** `1770000020000-AddGoodsReceiptReversal` adds nullable GRN reason/user/timestamp fields, a user FK/index, ledger valuation method/original value/relief value/variance, a unique FK to the original ledger movement, tenant business date, and JSON layer allocation details. Status remains varchar. Migration up tolerates retry after partial MySQL DDL; down refuses to remove any existing reversal/audit/valuation data. The existing unique source movement key remains the first idempotency safeguard; the unique original-ledger reference adds another.

3. **Endpoints and permission.** `GET /api/purchasing/goods-receipts/reversal-candidates`, `GET /api/purchasing/goods-receipts/:id/reversal-preview`, and `PATCH /api/purchasing/goods-receipts/:id/reverse` all require `GRN_REVERSE`. Candidates use the existing page/limit/search/receiptType response conventions and tenant/location filters. The authorization catalog creates the permission at backend startup. Existing tenant administrators receive it through the existing admin bypass when PURCHASING is enabled. Other roles need an explicit assignment through Role Permissions; existing GRN_POST/GRN_CANCEL grants do not confer reversal permission. Refresh the user's login to refresh the frontend's stored permission list. Assign GRN_VIEW as well for normal list/detail access.

4. **Valuation.** Each product/location is evaluated separately. An uninterrupted original posting tail plus matching current quantity/WAVG snapshots uses `EXACT_ORIGINAL`, restores pre-receipt quantity/WAVG, relieves original value and records zero variance. Multiple lines for the same product unwind in reverse posting order. Otherwise `CURRENT_WAVG_COMPENSATION` removes original base quantity at current WAVG and persists original value minus relief as variance. Later ledger rows and historical COGS remain unchanged. Reversal arithmetic uses scaled BigInt with half-away-from-zero rounding and DECIMAL(18,4) range checks; six-decimal purchase conversions are validated without floating-point arithmetic.

5. **Direct transaction.** Resolve one clock, lock tenant GRN, validate assigned location and POSTED/no-reversal state, lock original lines/ledger, product contexts and balances in product order, then layers. Recalculate independently of preview, require negative-stock confirmation when necessary, save stock relief and one compensating movement per original line, allocate layers, and finally save REVERSED/audit fields. Any failure rolls the complete transaction back. Concurrent reversal requests serialize on the GRN lock; the second returns 409.

6. **PO transaction.** The same transaction also locks the linked PO and its lines, validates original links, subtracts only this GRN's purchase quantities and rejects underflow. Lines become OPEN/PART_RECEIVED/RECEIVED; the header becomes APPROVED/PART_RECEIVED/RECEIVED from all lines. Other GRNs' quantities remain intact. Current supplier prices, active purchasing flags and current conversion settings are not consulted. The shared header-status helper is also used after posting.

7. **Age layers.** Reusable stock relief takes a quantity and optional preferred source. Exact reversal deactivates the remaining original layer; compensation consumes original remaining stock first and then FIFO by receipt date/ID. The reversal movement stores each affected layer ID, consumed quantity and before/after quantities, plus `unallocatedQuantity` when available layers do not cover the stock-out. No synthetic receipt date is assigned to a shortage. Inventory balance/ledger remain authoritative. Existing layers may already be stale because earlier stock-outs did not decrement them; the operation records actual current layer state and does not infer or reconstruct historical consumption. Future stock-out modules can call the same operation without a preferred source, but must maintain layer allocations when implemented.

8. **Location hardening.** Both list variants, detail, update, cancel, post, preview and reverse enforce tenant/location scope. Detail and cancel can no longer bypass assigned locations by ID. Cancel only accepts DRAFT, so REVERSED and CANCELLED remain terminal. Historical receipt access/reversal does not require the location to remain active; creation/posting still validates active references.

9. **Screen.** `/goods-receipts/reverse` and permission-filtered navigation/list actions provide the dedicated flow. Search is debounced and paginated on the server. Original details and quantities are read-only; the table shows quantity, cost, WAVG, relief, variance, method and projected stock. The screen includes PO effects, mandatory reason, negative-stock warnings/checkbox, discard confirmation and final irreversible-action confirmation. Pending requests disable controls. Errors preserve selection/reason and refresh the preview. Success invalidates receipt/inventory/product/PO queries and navigates to the existing immutable GRN view with reversal audit. The list includes Reversed filtering and view-only terminal records. Mobile layout was checked at 390px; wide line tables scroll inside their card.

10. **Accounting-ready audit.** Original document/base quantity and value, original GRN/line and ledger references, relief value, variance, valuation method, before/after quantity/WAVG, layer allocations, user, timestamp and tenant business date persist. Before/after inventory values are recoverable from the existing quantity × WAVG snapshots, with the same decimal rounding. Zero quantity in late compensation sets WAVG to zero and preserves the document-versus-relief difference in variance. Negative inventory retains current WAVG and its signed quantity/value. No variance journal is posted.

11. **Verification.** `npm.cmd test` in backend: 141 tests passed, including 13 new reversal unit/permission/precision tests. `npm.cmd run test:grn:mysql`: 18 tests passed (17 transaction/migration cases plus the parent suite), using a disposable local MySQL database. Cases include exact/late Direct and PO, duplicate/concurrent requests, PO reopening and preservation of other receipts, stale previews, negative and zero stock, multiple lines for one product, missing/mismatched ledgers, PO underflow, tenant/location isolation, unique indexes, migration retry/down refusal, and rollback at both ledger insertion and final GRN save. The final-save failure was injected using a trigger only in the disposable test database. Backend build, frontend TypeScript/production build and `git diff --check` passed. Browser verification used synthetic API responses on an isolated local port; it covered desktop/mobile layout, candidate metadata, reason/negative gates, clear-selection confirmation, final PO confirmation, pending controls and successful read-only audit navigation. The temporary UI harness was removed.

12. **Deployment and limitations.** Apply the migration before starting this backend release through the existing deployment process; it has not been applied to the configured application database. Restart the backend to register GRN_REVERSE, assign non-admin grants and refresh logins. MySQL DDL is implicitly committed; down is intentionally blocked once reversal data exists. The existing inventory model stores quantity and WAVG rather than an independent inventory-value balance; derived snapshot values retain that convention and historical rounding. Historic age-layer inaccuracies cannot be reconstructed without original stock-out allocation data; shortage allocations are explicit on each new movement. Browser checks used synthetic data rather than a live authenticated production workflow. Vite emits its existing large-chunk warning; the build succeeds. Full reversal is terminal; partial reversal, supplier returns, adjustments, AP and GL remain outside this feature.

13. **Exact changed files.**

```text
backend/package.json
backend/docs/grn-reversal.md
backend/src/common/inventory-decimal.ts
backend/src/features/auth/authorization-catalog.service.ts
backend/src/features/goods-receipts/dto/reverse-goods-receipt.dto.ts
backend/src/features/goods-receipts/goods-receipt.entity.ts
backend/src/features/goods-receipts/goods-receipt-reversal.ts
backend/src/features/goods-receipts/goods-receipt-reversal.spec.ts
backend/src/features/goods-receipts/goods-receipt-reversal.mysql.ts
backend/src/features/goods-receipts/goods-receipts.controller.ts
backend/src/features/goods-receipts/goods-receipts.service.ts
backend/src/features/goods-receipts/goods-receipts.service.spec.ts
backend/src/features/inventory-age-layers/inventory-age-layer.service.ts
backend/src/features/inventory-balance/inventory-balance.service.ts
backend/src/features/inventory-ledger/inventory-ledger.entity.ts
backend/src/migrations/1770000020000-AddGoodsReceiptReversal.ts
frontend/src/app/App.tsx
frontend/src/app/router.tsx
frontend/src/components/ui/SearchableSelect.tsx
frontend/src/features/purchasing/api/purchasingApi.ts
frontend/src/features/purchasing/pages/GoodsReceiptReversalScreen.tsx
frontend/src/features/purchasing/pages/GoodsReceiptScreen.tsx
frontend/src/features/purchasing/pages/GoodsReceiptsPage.tsx
frontend/src/styles.css
```

To rerun the MySQL suite, use a local MySQL account capable of creating/dropping a disposable database, creating tables/foreign keys/indexes, and creating a test trigger. The suite reads connection credentials from backend `.env`, explicitly rejects non-local hosts, never selects `DB_DATABASE`, and validates the generated database name before cleanup. Run `npm.cmd run test:grn:mysql` from backend. No real tenant fixtures or application tables are read or modified.
