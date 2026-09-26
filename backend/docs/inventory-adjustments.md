# Inventory adjustments

Inventory corrections use `ADJI` (in) and `ADJO` (out). Business meaning is held separately in the tenant-scoped reason master. Cycle count itself is not part of this feature; `CYCLE_RECONCILIATION` is only a system reason reserved for a future producer.

## Valuation and quantities

- `tbl_inventory_balance.average_cost` is the only current-WAVG source of truth.
- Entered quantity is a positive magnitude in the selected `ProductUnit`. The line snapshots its six-decimal conversion factor and decimal-safe base quantity. Inventory balance, ledger, and age layers use base quantity.
- A manual `unitCost` is a cost per base unit. It is accepted only for a `MANUAL_REQUIRED` reason. `OPENING_INVENTORY` is the seeded manual-cost reason and is posted as `ADJI`.
- An opening adjustment into zero or negative stock adopts the manual cost, matching the existing inbound balance algorithm. Into positive stock, the resulting WAVG is `(existing quantity × existing WAVG + inbound base quantity × manual cost) / resulting quantity`.
- CURRENT_WAVG ADJI and every ADJO use the locked balance WAVG. A CURRENT_WAVG ADJI requires a positive balance WAVG; a retained positive WAVG remains usable when on-hand quantity is zero, while a missing, null, zero, or negative WAVG is rejected before posting. They do not consult supplier links or supplier prices.
- The existing ledger stores positive movement magnitude with mutually exclusive `quantity_in` / `quantity_out` columns. Therefore ADJO uses positive `quantity_out` and `movement_value`; its direction is not represented by a negative value.
- Adjustment-in creates an inventory age layer at the tenant business date. Adjustment-out relieves age layers FIFO and records allocations/unallocated quantity on its ledger row.

## Lifecycle and concurrency

Drafts alone can be changed or cancelled. Posting locks the header, lines, product-location context, balance, and outbound age layers in deterministic product order. All line snapshots, balance changes, ledger records, layers, document number, and posted audit fields commit in one TypeORM transaction. The ledger source uniqueness constraint and locked `DRAFT` check prevent duplicate posting.

There is no configured tenant/product negative-stock flag in the current schema. Following the established GRN-reversal convention, an ADJO that crosses below zero requires `confirmNegativeStock: true`; it retains the current WAVG.

Reasons marked `requires_approval` cannot be directly posted because the ERP does not yet have an inventory-adjustment approval workflow. System reasons cannot be modified or deactivated. Posted adjustments are immutable; reversal is intentionally not implemented.

## APIs

- `GET /api/inventory/adjustment-reasons`
- `POST /api/inventory/adjustment-reasons`
- `PUT /api/inventory/adjustment-reasons/:id`
- `PATCH /api/inventory/adjustment-reasons/:id/active`
- `POST /api/inventory/adjustments`
- `GET /api/inventory/adjustments`
- `GET /api/inventory/adjustments/:id`
- `PUT /api/inventory/adjustments/:id`
- `PATCH /api/inventory/adjustments/:id`
- `PATCH /api/inventory/adjustments/:id/post`
- `PATCH /api/inventory/adjustments/:id/cancel`

Opening inventory additionally requires `INVENTORY_OPENING_POST`; normal posting requires `INVENTORY_ADJUSTMENT_POST`.
