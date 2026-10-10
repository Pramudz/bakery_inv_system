# Opening Inventory Bulk Import (MVP)

## Scope and business rules

Opening Inventory Bulk Import posts existing, active stock products into existing, active tenant locations. The product must have an active Product Location and an active eligible Product Unit. The entered quantity is converted into the product's base stock unit. `BaseUnitCost` is the price of **one base unit**, including when `Quantity` is entered in a converted unit. Both quantity and base-unit cost must be greater than zero. The import rejects `trackBatch`, `trackExpiry`, and `trackSerial` products.

One tenant/product/location can receive opening stock only once. A previous ledger movement, opening claim, positive or negative balance, nonzero WAVG, prior movement timestamp, or orphan age layer blocks opening. A zero current quantity is not evidence that a location has never had stock. The same protection applies to manually posted adjustments using the `OPENING_INVENTORY` reason. A different Dataset ID, workbook, or RowReference cannot authorize a second opening.

Opening documents, ledger movements, and age layers use the tenant's **current business date at confirmation**. Historical posting and physical receipt dates are not supported. The inventory aging calculation dates ADJI from its ledger business date. Do not enter an older date in remarks expecting historical valuation or aging.

## Architecture and posting

The new module provides XLSX parsing, tenant-scoped validation, preview storage, confirmation, results, and history. The importer never writes stock balances itself. It calls `InventoryAdjustmentsService.createWithManager` and `postWithManager` with its own transaction manager and shared posting clock. The ADJI posting path continues to calculate WAVG through `InventoryBalanceService`, write an `INVENTORY_ADJUSTMENT`/`ADJI` ledger line, write an age layer, and keep adjustment number, reason, source line, and actor references. It creates no PO, GRN, or sales invoice.

Confirmation runs in one MySQL `READ COMMITTED` transaction. It locks the import batch, validates source rows, locks the referenced products, locations, Product Units and units, sorts target locations/products, locks each Product Location, reserves and locks a zero balance row if the target has no balance, and checks opening claims, ledger history, age layers, and balance state using current locking reads. It then revalidates against the approved preview and posts one ADJI document per location, with one line per distinct product. The transaction includes adjustment documents and lines, balances, ledger and age layers, claims, final results, and completed batch state. A failure on any row rolls all these writes back. A completed batch retry returns the stored results. The stored file hash is SHA-256 of the original workbook bytes.

Source inspection indicates that the combined Product Location and balance lock coordinates with GRN and reversal, ordinary ADJI, inventory conversion, POS sale, refund return, and stock transfer: those paths acquire Product Location and/or balance locks before writing their ledger. The import's zero-row reservation makes the first balance row lockable. Cross-document deadlocks remain possible under concurrent operations; MySQL aborts one transaction, which the operator can preview again. **Actual coordination remains unverified until concurrent MySQL regression and isolated database acceptance tests pass; do not treat this source-level argument as deployment proof.**

The `OPENING_INVENTORY` system reason is resolved by tenant/code, never a numeric constant. It must be active, `IN`, `MANUAL_REQUIRED`, and not require approval. A manually created opening ADJI also writes a claim in its posting transaction. Historic manual openings preceding the new claim table are rejected by their ledger history.

## Workbook

Download a blank or fictional sample `.xlsx` workbook. The `Opening Stock` sheet has these exact headers, in order:

| Column | Required | Meaning |
| --- | --- | --- |
| `LocationCode` | Yes | Existing tenant location code. Multiple locations are allowed per workbook. |
| `SKU` | Yes | Existing tenant stock product SKU. |
| `UnitCode` | Yes | Existing active tenant unit linked through an eligible active Product Unit. |
| `Quantity` | Yes | Positive entered-unit quantity, up to four decimals and within the unit's configured precision. |
| `BaseUnitCost` | Yes | Positive cost per **base stock unit**, up to four decimals. |
| `Remarks` | No | Row explanation, up to 2,000 characters. |
| `RowReference` | No | Source reference, up to 100 characters; it does not affect once-only protection. |

`Instructions` explains tenant codes, conversion, precision, business date, once-only protection, unsupported tracking, and error handling. The template has no editable date, batch, expiry, or serial fields. File size is limited to 5 MB and 1,000 populated rows. Only `.xlsx` is accepted; formulas, changed headers, and missing master records are rejected. Duplicate product/location rows within one workbook are errors, even if units or references differ. Conversion that would round the base quantity to four decimals is rejected. The preview shows the rounded four-decimal opening value calculated by the existing inventory decimal arithmetic.

## Workflow and permissions

1. Enter a stable Dataset ID and upload the workbook.
2. Review the row-level validation preview. It shows source row, product and location, entered and base quantities, factor, base cost, opening value, existing stock/WAVG, history/claim indicators, and full reasons. Quantity totals are grouped by base unit. Download the validation report even when rows have errors.
3. Confirm explicitly only when **all** rows are ready. Confirmation revalidates the preview under posting locks. If the data changed, upload and preview again.
4. View the posted results or download the results workbook. History is paginated at 20, 50, or 100 batches. An interrupted confirmation response can be recovered by checking the batch status; never upload a new file simply because the response was lost.

Tenant authentication and the Inventory module are required. Template, history, batch, and report reads require `INVENTORY_ADJUSTMENT_VIEW`; upload/preview also requires `INVENTORY_ADJUSTMENT_CREATE`; confirmation requires `INVENTORY_ADJUSTMENT_CREATE`, `INVENTORY_ADJUSTMENT_POST`, and `INVENTORY_OPENING_POST`. ADJI additionally verifies opening-post permission in its service. Location-scoped users may upload only assigned locations; their history is limited to their own batches, and reports are denied when a resolved location is no longer assigned. Unknown or other-tenant codes reveal no stock details.

## API

All routes have the `/opening-inventory-imports` prefix:

| Method | Route | Result |
| --- | --- | --- |
| GET | `/template?sample=false\|true` | Blank or fictional sample XLSX. |
| POST | `/preview` | Multipart `datasetId` and `file`; durable validation preview. |
| GET | `/history?page=1&limit=20` | Tenant-scoped paginated batches. |
| GET | `/:batchId` | Saved preview or completed result; useful after an interrupted request. |
| GET | `/:batchId/validation-report` | XLSX row validation report. |
| POST | `/:batchId/confirm` | Atomic posting or idempotent completed result. |
| GET | `/:batchId/results` | XLSX posted results. |

The validation report includes source sheet/row, codes, quantities, costs, value, status, and full reason. Results include Dataset ID, RowReference, business date, adjustment and ledger references, final quantity, and WAVG. Exported text beginning with formula-like characters is escaped.

## Database migration and deployment

Migration `1770000046000-AddOpeningInventoryBulkImports.ts` creates `tbl_opening_inventory_import_batch` and `tbl_inventory_opening_claim`. The claim has a unique `(tenant_id, product_id, location_id)` constraint and foreign keys to its source adjustment and optional batch. The migration adds tenant/product/location history indexes to ledger and age layers; it does not rewrite or delete stock records. TypeORM synchronization stays disabled.

Deployment procedure for an operator:

1. Run the manual acceptance cases below against an isolated disposable MySQL database. Observe actual concurrent posting behavior and retry responses. Resolve failures before production deployment.
2. Back up the production database and verify its migration state and each tenant's `OPENING_INVENTORY` reason configuration.
3. Apply the reviewed migration before starting the new backend so manual opening posting can write claims. Deploy backend and frontend together; do not enable the UI against an unmigrated schema.
4. Verify role grants, Inventory module enablement, and location assignments.
5. Schedule tenant onboarding only after the isolated trial and operational approval. The import does not repair prior stock history or clear test data.

This document does not authorize migration execution or production data changes. The implementation phase did not run migrations.

## Manual acceptance on an isolated disposable database

Use a fresh database cloned from development schema and **fictional** tenants/products. Apply the migration there as part of the separate acceptance exercise. Do not point these steps at a real tenant. Prepare two active, untracked stock products with base Product Units, two active locations, and active Product Locations. Include one converted unit with an exact factor. Record tenant, location, product, and batch IDs for parameterized read-only queries.

1. Verify the migration created both tables, unique claim index, history indexes, and foreign keys; verify the reason is active, `IN`, `MANUAL_REQUIRED`.
2. Download the sample and replace fictional codes with the isolated tenant's codes. Open two products at one location, then the same SKU at the second location in a separate batch.
3. Confirm base and converted quantities, positive base cost, ledger inbound `ADJI`, opening reason, age-layer receipt date, adjustment source references, and initial WAVG equal to base-unit cost.
4. Retry the completed batch and confirm no new ledger or claim. Try another Dataset ID, changed workbook, and changed RowReference for the same target; each must fail.
5. Test an existing positive balance, zero balance with historical ledger, a prior claim, and a batch where the final row fails. Verify no earlier row remains posted and no orphan claim exists.
6. Test unknown and cross-tenant codes, inactive/non-stock/tracked products, unit precision, zero cost, a location-scoped user, and a user lacking `INVENTORY_OPENING_POST`.
7. Race two confirmation requests for the same target and race opening confirmation against GRN, POS stock deduction, and transfer receipt. Exactly one conflicting operation should succeed; verify balance, ledger, age layer, and claim reconciliation. Capture deadlock/conflict responses and re-preview where appropriate.

### Read-only verification SQL

Bind `?` parameters in the client; do not interpolate user-entered codes into SQL. Every query must be run against the isolated database only.

```sql
SELECT name, timestamp FROM migrations ORDER BY timestamp DESC LIMIT 10;
SELECT table_name, index_name, non_unique, column_name, seq_in_index
FROM information_schema.statistics
WHERE table_schema = DATABASE() AND table_name IN
  ('tbl_opening_inventory_import_batch','tbl_inventory_opening_claim','tbl_inventory_ledger','tbl_inventory_age_layer')
ORDER BY table_name, index_name, seq_in_index;

SELECT tenant_id, code, allowed_direction, costing_policy, requires_approval, is_active
FROM tbl_inventory_adjustment_reason WHERE tenant_id = ? AND code = 'OPENING_INVENTORY';

SELECT tenant_id, location_id, product_id, quantity_on_hand, average_cost, last_movement_at
FROM tbl_inventory_balance WHERE tenant_id = ? AND location_id = ? AND product_id = ?;

SELECT inventory_ledger_id, business_date, movement_type, source_document_type,
       source_document_id, source_document_line_id, quantity_in, movement_value,
       quantity_before, quantity_after, average_cost_before, average_cost_after,
       inventory_adjustment_reason_id
FROM tbl_inventory_ledger
WHERE tenant_id = ? AND location_id = ? AND product_id = ? ORDER BY inventory_ledger_id;

SELECT inventory_age_layer_id, source_document_type, source_document_id,
       source_document_line_id, receipt_date, original_quantity, remaining_quantity,
       original_unit_cost, batch_number, expiry_date
FROM tbl_inventory_age_layer
WHERE tenant_id = ? AND location_id = ? AND product_id = ? ORDER BY inventory_age_layer_id;

SELECT inventory_opening_claim_id, tenant_id, product_id, location_id,
       source_import_batch_id, source_adjustment_id, source_adjustment_line_id, created_at
FROM tbl_inventory_opening_claim
WHERE tenant_id = ? AND product_id = ? AND location_id = ?;

SELECT batch_id, tenant_id, dataset_id, file_hash, status,
       created_by_user_id, confirmed_by_user_id, created_at, completed_at
FROM tbl_opening_inventory_import_batch WHERE tenant_id = ? ORDER BY batch_id DESC;
```

## Corrections and limitations

An incorrect posted opening stays in the audit trail. An authorized user must post a documented corrective stock adjustment using the ordinary adjustment process and inspect its WAVG/ledger effects. Do **not** delete the original posting or use another opening batch to offset or replace it. Corrections may require finance approval outside this MVP.

The MVP cannot import batch, expiry, or serial tracked products; cannot backdate opening or aging; cannot aggregate duplicate product/location rows; and cannot seed missing product or location masters. Every row is either READY/POSTED or ERROR; there is no partial-row SKIP posting. The fictional sample cannot be posted until its codes are replaced. The 1,000-row limit can produce a long confirmation lock window and should be measured in the isolated trial. Database migration and real concurrency behavior remain to be verified in an isolated test environment before any deployment-readiness claim.
