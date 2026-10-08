# Reference master bulk import

## Scope and deployment

The Bulk Data Import page at `/bulk-data-import` handles categories, brands, units of measure, suppliers, price lists and locations. It creates new records, skips records whose tenant-scoped code already exists, and reports invalid rows. It never updates existing master records. The page appears when the signed-in user has at least one of the six view permissions. Each operation checks that master's view or create permission and enabled tenant module on the server.

Build and deploy the backend and frontend as usual. Run the TypeORM migration `1770000044000-AddReferenceMasterImports` with `cd backend && npm run migration:run` against the intended deployment database before using the feature. The migration adds import batches and supplier import-reference mappings; it does not change any master table. Do not enable schema synchronization. The 12 checked-in workbooks are in `backend/templates/reference-imports/`; `cd backend && npm run generate:reference-import-files` regenerates them from the schema. The UI downloads fresh copies from authenticated API endpoints, so the production backend need not serve the checked-in files.

## API

All paths start with `/api/reference-imports` and require tenant authentication. The `:master` values are `categories`, `brands`, `units`, `suppliers`, `price-lists`, and `locations`.

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/:master/template?sample=false` | `<MASTER>_VIEW` | Blank Excel template |
| GET | `/:master/template?sample=true` | `<MASTER>_VIEW` | Populated sample Excel |
| POST | `/:master/preview` | `<MASTER>_CREATE` | Multipart field `file`; validate and persist a preview batch |
| GET | `/:master/:batchId` | `<MASTER>_VIEW` | Reopen tenant-scoped preview/results |
| POST | `/:master/:batchId/confirm` | `<MASTER>_CREATE` | Confirm once; repeated calls return the stored result |
| GET | `/:master/:batchId/results` | `<MASTER>_VIEW` | Download the completed results workbook |

`PRICE_LIST` is the permission prefix for `price-lists`. The other prefixes are `CATEGORY`, `BRAND`, `UNIT`, `SUPPLIER`, and `LOCATION`. The server reads tenant ID only from the authenticated principal. Excel sheets have exact headers and may contain at most 1,000 data rows in a 5 MB `.xlsx` file. Formulas are rejected. Files have a `Data` sheet and an `Instructions` sheet with required fields, allowed values, sample data and code-reference rules.

## Confirmation and retries

Preview parses and validates without writing any master record. It persists only the uploaded rows and SHA-256 file identity in a tenant-scoped batch. Confirmation locks the batch and tenant, revalidates against current tenant data, then creates all valid new rows in one database transaction. Rows with validation errors remain `ERROR`; pre-existing codes or supplier references are `SKIP`. Successful rows are `CREATE` with their final code. Any unexpected database error rolls back all new master records, supplier sequence increments, supplier reference mappings and batch completion. The preview batch remains confirmable after that rollback. All six masters share this behavior.

The same tenant, master and exact file bytes identify one batch. Confirming that batch again cannot create duplicates. A supplier with blank `SupplierCode` must carry a stable `SupplierImportRef` (up to 100 characters). That reference is unique within the tenant and maps to its generated supplier code. Reuploading an edited workbook with the same reference skips that supplier. Generated codes use the ordinary supplier service, `NumberSequencesService`, `NumberSequenceKeys.SUPPLIER` and the existing formatter. Manual supplier codes in an upload are created before automatic ones so generated codes avoid them. The result workbook includes row number, outcome, final code, supplier import reference, record name and errors.

Category parents use `ParentCategoryCode`, resolved from the same tenant or valid rows of the upload. Parents are created before children, even if Excel rows are out of order. Missing parents, cycles, duplicate names and more than three levels are errors. Price-list imports accept the existing free-text type field, but reject multiple active defaults for RETAIL or WHOLESALE because POS price resolution otherwise becomes ambiguous. Ordinary CRUD logic is unchanged.

## Manual check

1. Start MySQL and configure the backend `.env`. Run the migration in the intended database, then start `cd backend && npm run start:dev` and `cd frontend && npm run dev` in separate terminals.
2. Sign in as a tenant user with view/create permission for a master. Open **Master Data → Bulk Data Import**. Select each master in turn; download its blank template and sample.
3. Upload one sample. Check row numbers, `CREATE` counts and category parent relationships in the preview. Confirm, then download the results. For suppliers, check generated `SUP-` codes and `SupplierImportRef` mappings.
4. Upload the identical file again. The completed batch and its results should return without new records. For suppliers, edit a non-key field in the workbook and upload again with the same import references; those rows should be `SKIP`.
5. Try a missing required field, duplicate code, bad location type, four-level category hierarchy and a second default retail price list. Check the row-level `ERROR` messages. Verify a user lacking the selected master's create permission cannot preview or confirm.

## Limits

The import does not update existing records. Preview batches and results are retained in the database until an operator adds a retention policy. The system does not claim that ordinary CRUD writers are serialized with imports; confirmation rechecks records under a tenant lock, while existing CRUD paths keep their current behavior. Existing category, brand, unit and price-list tables do not all have database unique-code constraints, so concurrent ordinary CRUD calls can still create code duplicates. `npm audit --omit=dev` reports two moderate advisories for ExcelJS's `uuid` 8 dependency; the affected UUID v3/v5/v6 buffer path is not used by ExcelJS's observed v4 call site. No live MySQL migration or import was run as part of implementation.
