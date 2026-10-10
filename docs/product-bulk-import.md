# Product bulk import and maintenance

## Scope and deployment

The **Product Bulk Import** page at `/product-bulk-import` offers complete onboarding and ten individual imports. Download templates from the page. The backend generates blank and fictional sample workbooks from one schema; no checked-in Excel copy is needed. Importing never creates reference masters, inventory balances, opening stock, or product images. POS sales remain in base units.

Deploy the backend and frontend builds and run migration `1770000045000-AddProductBulkImports` against the intended database before enabling the page. The migration creates only `tbl_product_import_batch` and `tbl_product_import_ref`. It was created but not run during implementation. Keep TypeORM schema synchronization disabled.

## Workbook contract and Wizard mapping

Onboarding requires a stable Dataset ID and uses `ProductImportKey` in every relationship sheet. Individual Product Master CREATE also requires a Dataset ID and `ProductImportKey`; the ERP generates its SKU. All other individual maintenance rows identify an existing product by SKU. Reusing a dataset and key with different source data is rejected. An identical completed batch returns its stored results.

| Wizard step | Workbook sheet and Excel fields | Entity / database columns | Shared service / DTO and validation |
| --- | --- | --- | --- |
| General | `01 Products`: `ProductName`, `Description`, `ProductType`, `CategoryCode`, `BrandCode`, `BaseUnitCode`, active/sellable/purchasable/stock/tracking flags | `Product`: `product_name`, `description`, `product_type`, `category_id`, `brand_id`, `base_unit_id`, corresponding flags | `ProductService.createWithManager` / `updateGeneral`, `CreateProductDto`; active tenant codes and operational readiness |
| Units | `02 Product Units`: `UnitCode`, `ConversionFactor`, base/purchase/sales/active flags | `ProductUnit`: `unit_id`, `conversion_factor`, corresponding flags | Product aggregate / `updateUnits`; one active base, only base sales unit, conversion integrity |
| Identifiers | `03 Identifiers`: `IdentifierTypeCode`, `IdentifierValue`, `UnitCode`, primary/active flags; individual maintenance adds optional `ExistingIdentifierValue` | `ProductIdentifier`: `identifier_type_id`, `identifier_value`, `normalized_identifier_value`, `product_unit_id`, flags | `updateIdentifiers`; existing record identity, active identifier type, tenant-wide normalized uniqueness and one active primary |
| Selling prices | `04 Selling Prices`: `PriceListCode`, `UnitCode`, `SellingPrice`, `CurrencyCode`, `MinimumQuantity`, `EffectiveFrom`, `EffectiveTo`, `IsActive` | `PriceListItem`: `price_list_id`, `product_unit_id`, `selling_price`, `currency_code`, `minimum_quantity`, effective period, active flag | Product aggregate price sync / `publishSellingPrices`; exact context, base sales unit, no overlapping version |
| Discounts | `05 Selling Discounts`: price list/unit/currency/tier, `PriceEffectiveFrom`, `DiscountType`, `DiscountValue`, effective period | `PriceListItemDiscount`: `price_list_item_id`, `discount_type`, `discount_value`, effective period, `created_by`, `ended_by` | Nested Product Create discount / `PriceListItemDiscountService`; parent price validity, decimal limits, no overlap |
| Suppliers | `06 Product Suppliers`: `SupplierCode`, `IsPrimarySupplier`, `BaselineLeadTimeDays`, `IsActive` | `ProductSupplier`: `supplier_id`, `is_primary_supplier`, `baseline_lead_time_days`, `is_active` | Product aggregate / `updateSupplierLinks`; active tenant supplier and primary selection |
| Supplier purchase units | `07 Supplier Purchase Units`: `SupplierCode`, `UnitCode`, `SupplierProductCode`, `MinimumOrderQty`, `LeadTimeDays`, default/active flags | `ProductSupplierUnit`: supplier link/product unit IDs, supplier product code, MOQ, lead time, flags | Product aggregate / `ProductSupplierUnitsService`; active purchase unit chain and existing Product Unit conversion |
| Supplier purchase prices | `08 Supplier Purchase Prices`: supplier/unit codes, `PurchasePrice`, `CurrencyCode`, `MinimumQuantity`, effective period, `IsActive` | `ProductSupplierPrice`: `product_supplier_unit_id`, `purchase_price`, `currency_code`, `minimum_quantity`, effective period, active flag | Product aggregate / `publishSupplierPurchasePrices`; exact supplier context, dated versions, whole-second storage |
| Locations | `09 Product Locations`: `LocationCode`, active/sellable/purchasable flags | `ProductLocation`: `location_id`, corresponding flags | Product aggregate / `updateLocations`; tenant and assigned location checks |
| Attributes | `10 Product Attributes`: `AttributeCode`, `Value` | `ProductAttributes`: `attribute_id`, `value` | Product aggregate / `updateAttributes`; active tenant attribute and value length |
| Images | Deferred | `ProductImage` | Existing URL/upload workflow is not represented in Excel |

The generated **Instructions** worksheet and column notes explain field requirements, code references, dates, currencies, booleans, operations, and purchase conversions. In individual Identifiers maintenance, use `ExistingIdentifierValue` on UPDATE when replacing a barcode; leave it blank when `IdentifierValue` still identifies the existing record. The importer resolves the old identifier within the selected tenant and product, rejects duplicate normalized values, and previews primary-identifier conflicts. Rows for one product are evaluated in workbook order: demote the current primary before creating another primary. Onboarding prices and discounts use `YYYY-MM-DD` tenant business dates, matching the Product Wizard. A `YYYY-MM-DD` maintenance start uses midnight in the tenant time zone; a date-only end includes that tenant day. An ISO timestamp with offset is used as the stated instant. Supplier purchase prices store whole seconds, so maintenance timestamps with fractional seconds are rejected and a date-only end is stored as the last whole second of the tenant day. Headers must match exactly; older individual Identifiers files without `ExistingIdentifierValue` remain readable. Each worksheet accepts at most 1,000 populated data rows; the file limit is 5 MB. Formulas are rejected. Blank optional maintenance cells leave existing values unchanged. Product, unit, identifier, supplier, location, and attribute sheets support explicit CREATE/UPDATE where applicable. Selling prices, supplier prices, and discounts support CREATE/REVISE/END. Every sheet supports SKIP. Invalid rows show ERROR in preview.

## API and permissions

All paths start with `/api/product-imports/:type`. `:type` is `onboarding`, `products`, `product-units`, `identifiers`, `selling-prices`, `selling-discounts`, `product-suppliers`, `supplier-units`, `supplier-prices`, `product-locations`, or `product-attributes`.

| Method | Suffix | Purpose |
| --- | --- | --- |
| GET | `/template?sample=true\|false` | Blank or sample workbook |
| POST | `/preview` | Multipart `file` plus `datasetId` for product creation; save validated preview |
| GET | `/history?page=1&limit=20` | Tenant batch history, newest first, with `items`, `totalCount`, and `totalPages`; limit 20, 50 or 100 |
| GET | `/:batchId` | Reopen preview or completed result |
| POST | `/:batchId/confirm` | Revalidate and commit once |
| GET | `/:batchId/results` | Results workbook |
| GET | `/:batchId/validation-report` | Preview validation workbook with every sheet row, status, source identifiers, impact and full reason; no confirmation needed |

The server uses the authenticated tenant and existing PRODUCT permissions. GET requires PRODUCT_VIEW. POST requires PRODUCT_CREATE for onboarding, PRODUCT_UPDATE for relationship and price maintenance, and both for the mixed Product Master sheet. Tenant module enablement is checked. Location-scoped users cannot reference unassigned locations.

## Pricing, transactions, and retries

The importer resolves reference codes to active tenant records, except identifier types, which use the ERP's active global catalog; no reference ID is accepted from Excel. Selling price context is product, price list, active base sales product unit, currency, and minimum quantity. Supplier price context is product, supplier purchase unit, currency, and minimum quantity. REVISE uses the shared Wizard publisher to end only the selected current version immediately before the replacement starts: one millisecond for selling prices and discounts, or one stored second for supplier prices. The old amount remains recorded. Selling price revisions end attached discounts with audit attribution; discount carry-forward requires a separate explicit import. Existing future schedules in the same context block a conflicting revision. Backdated maintenance prices and discounts are rejected. Maintenance CREATE/REVISE prices are open-ended; use END to specify a closing date. Initial onboarding versions can carry effective end dates.

Preview writes batch metadata only. Confirmation locks the batch and tenant row, rebuilds the plan from current tenant records, and rejects a changed plan. Each workbook is all-or-nothing in one database transaction; any validation or write failure rolls back every business change in that workbook. This gives no partial successes. The transaction includes SKU assignment, product relationships, price and discount changes, reference mapping, and completion status. Retrying a completed batch returns the stored result without another write. The UI checks server batch status after an interrupted confirmation request.

## Manual verification

1. On a disposable tenant database, apply the migration, enable the Product module, and sign in with relevant PRODUCT permissions.
2. Create the reference masters used in a sample, replacing its illustrative codes with actual active tenant codes. Download the combined blank and sample workbooks from **Product Bulk Import**.
3. Preview combined onboarding with a new Dataset ID. Check all ten sheet rows, reference resolution, and readiness counts. Confirm. Verify the generated SKU, all linked records, the result workbook, and batch history.
4. Retry the same file and Dataset ID. Verify the result is returned without another SKU or price version. Edit data under the same ProductImportKey and confirm that the changed definition is rejected.
5. For each individual option, download the blank and sample workbook. Replace the fictional SKU and codes with real tenant values. Preview and confirm a valid relationship CREATE/UPDATE. Check that blank optional fields do not clear existing data.
6. Revise a current Retail price with a future timestamp. Check that preview shows old/new amounts, the old end boundary, and attached discount warning. Confirm, then verify the old amount, new version, discount history, POS Retail/Wholesale separation, and unchanged issued invoices.
7. Repeat for a supplier purchase cost and a discount. Check PO/GRN cost selection and that historical GRN/PO snapshots and WAVG remain unchanged.
8. Try a cross-tenant or inactive code, duplicate identifier, unsafe unit conversion, overlapping future price, backdated change, stale preview, and user without write permission. Check rejection and absence of partial writes.
9. Download the individual Identifiers sample. For an existing product with a barcode, enter its current value in `ExistingIdentifierValue` and a different `IdentifierValue`. Preview and confirm; verify the same Product Identifier ID remains, with the new normalized value, type, unit and primary flag. Repeat UPDATE with `ExistingIdentifierValue` blank and the unchanged value to change only a supplied flag.
10. With an active primary identifier already present, preview a CREATE row with `IsPrimary=TRUE`; it must show ERROR before confirmation. In one workbook, place an UPDATE demoting the existing primary before a CREATE of the new primary; both should preview READY and confirm atomically. Reverse the order and verify preview rejection. Try a normalized duplicate value belonging to another product and verify no write.
11. Change an identifier after a READY preview through the Product Master UI, then confirm the old batch. Expect the explicit database-changed/stale-preview error and no partial import. Correct and reupload the workbook.
12. Preview a workbook with errors on several sheets and SKIP rows. Download **Validation Report** before confirmation. Verify original sheet and Excel row, ProductImportKey/SKU, context, requested operation, status, old/new values, boundaries and complete reasons. Confirm must remain disabled until all errors are fixed.
13. Create more than 100 import batches in a disposable tenant. Verify history defaults to 20 per page, offers 20/50/100, shows the total count and deterministic newest-first pages, and retains the current page while viewing a batch. Sign into another tenant and verify its batches and reports are inaccessible.

On the disposable database, use read-only queries with the actual tenant and product IDs to compare preview, result workbook and stored history. For example, replace `7` and `123` below with the test tenant and generated product ID:

```sql
SELECT batch_id, import_type, dataset_id, status, completed_at
FROM tbl_product_import_batch WHERE tenant_id = 7 ORDER BY batch_id DESC;
SELECT import_key, sku, product_id, batch_id
FROM tbl_product_import_ref WHERE tenant_id = 7 ORDER BY id DESC;
SELECT price_list_item_id, price_list_id, product_unit_id, currency_code,
       minimum_quantity, selling_price, effective_from, effective_to, is_active
FROM tbl_price_list_item WHERE tenant_id = 7 AND product_id = 123
ORDER BY price_list_id, minimum_quantity, effective_from;
SELECT d.price_list_item_discount_id, d.price_list_item_id, d.discount_type,
       d.discount_value, d.effective_from, d.effective_to, d.created_by, d.ended_by
FROM tbl_price_list_item_discount d
JOIN tbl_price_list_item p ON p.price_list_item_id = d.price_list_item_id
WHERE d.tenant_id = 7 AND p.product_id = 123 ORDER BY d.effective_from;
SELECT psp.product_supplier_price_id, psp.product_supplier_unit_id,
       psp.currency_code, psp.minimum_quantity, psp.purchase_price,
       psp.effective_from, psp.effective_to, psp.is_active
FROM tbl_product_supplier_price psp
JOIN tbl_product_supplier_unit psu ON psu.product_supplier_unit_id = psp.product_supplier_unit_id
JOIN tbl_product_supplier ps ON ps.product_supplier_id = psu.product_supplier_id
WHERE ps.product_id = 123 ORDER BY psp.product_supplier_unit_id, psp.minimum_quantity, psp.effective_from;
```

## Known limits

This implementation was verified by automated tests and production builds, not by a live MySQL migration/import. Ordinary CRUD paths do not share the import tenant lock; the importer revalidates before confirmation, but a separate concurrent CRUD write remains a deployment test risk. Product images and opening inventory are outside the workbook. Results and batch payloads remain stored until an operator adds a retention policy. Alternate currencies should be reviewed with POS display behavior before use. The Product Master-only CREATE path intentionally creates a non-operational staged product with sellable, purchasable, and stock flags false; enable them only after required relationships are present.
