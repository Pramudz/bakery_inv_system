import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductSupplierBaselineLeadTime1770000043000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const exists = await runner.hasColumn('tbl_product_supplier', 'baseline_lead_time_days');
    if (!exists) await runner.query('ALTER TABLE tbl_product_supplier ADD COLUMN baseline_lead_time_days INT NULL');
  }

  async down(runner: QueryRunner): Promise<void> {
    if (await runner.hasColumn('tbl_product_supplier', 'baseline_lead_time_days'))
      await runner.query('ALTER TABLE tbl_product_supplier DROP COLUMN baseline_lead_time_days');
  }
}
