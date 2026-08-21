import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillProductSupplierUnits1770000014000
  implements MigrationInterface
{
  name = 'BackfillProductSupplierUnits1770000014000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('tbl_product_supplier_unit');

    if (!table) {
      throw new Error('tbl_product_supplier_unit does not exist.');
    }

    // 1. Create the preferred/default unit from ProductSupplier.purchase_unit_id.
    await queryRunner.query(`
      INSERT INTO tbl_product_supplier_unit (
        product_supplier_id,
        product_unit_id,
        supplier_product_code,
        minimum_order_qty,
        lead_time_days,
        is_default_purchase_unit,
        is_active
      )
      SELECT
        ps.product_supplier_id,
        ps.purchase_unit_id,
        ps.supplier_product_code,
        ps.minimum_order_qty,
        ps.lead_time_days,
        1,
        ps.is_active
      FROM tbl_product_supplier ps
      INNER JOIN tbl_product_unit pu
        ON pu.product_unit_id = ps.purchase_unit_id
       AND pu.product_id = ps.product_id
      LEFT JOIN tbl_product_supplier_unit psu
        ON psu.product_supplier_id = ps.product_supplier_id
       AND psu.product_unit_id = ps.purchase_unit_id
      WHERE ps.purchase_unit_id IS NOT NULL
        AND psu.product_supplier_unit_id IS NULL
    `);

    // 2. Create any other unit implied by existing supplier-price history.
    await queryRunner.query(`
      INSERT INTO tbl_product_supplier_unit (
        product_supplier_id,
        product_unit_id,
        supplier_product_code,
        minimum_order_qty,
        lead_time_days,
        is_default_purchase_unit,
        is_active
      )
      SELECT DISTINCT
        psp.product_supplier_id,
        psp.product_unit_id,
        NULL,
        NULL,
        NULL,
        0,
        ps.is_active
      FROM tbl_product_supplier_price psp
      INNER JOIN tbl_product_supplier ps
        ON ps.product_supplier_id = psp.product_supplier_id
      INNER JOIN tbl_product_unit pu
        ON pu.product_unit_id = psp.product_unit_id
       AND pu.product_id = ps.product_id
      LEFT JOIN tbl_product_supplier_unit psu
        ON psu.product_supplier_id = psp.product_supplier_id
       AND psu.product_unit_id = psp.product_unit_id
      WHERE psu.product_supplier_unit_id IS NULL
    `);
  }

  async down(): Promise<void> {
    // Intentionally no-op.
    // Do not delete supplier-unit records: they may have been edited after backfill.
  }
}