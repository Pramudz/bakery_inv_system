# Product identifier duplicate resolution — 2026-08-18

Authorized resolution before applying `EnforceTenantProductIdentifierUniqueness1770000007000`:

- Deleted `tbl_product_identifier.product_identifier_id = 1` only after verifying it belonged to tenant 4, product 3 (`COC-500`, `COCA COLA 500ML`) with identifier value `123456789`, primary and active.
- Retained identifier row 4 with value `123456789` on tenant 4 product 7 (`SKU-000001`, `AneMataBa`).
- Changed identifier row 6 on tenant 5 product 11 (`SKU-000008`, `Coc Cola 500 ML`) from `12345678` to `1234567891`.
- Retained identifier row 7 with value `12345678` on tenant 5 product 12 (`SKU-000002`, `Pepsi-Cola 500ML`).

The deleted row can be reconstructed from the metadata above if recovery is required.
