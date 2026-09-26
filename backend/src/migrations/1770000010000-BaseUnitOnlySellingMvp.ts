import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class BaseUnitOnlySellingMvp1770000010000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    let unitTable = await queryRunner.getTable('tbl_unit_of_measure');
    if (unitTable && !unitTable.findColumnByName('allows_decimal_quantity'))
      await queryRunner.addColumn(unitTable, new TableColumn({ name: 'allows_decimal_quantity', type: 'tinyint', width: 1, default: false }));
    unitTable = await queryRunner.getTable('tbl_unit_of_measure');
    if (unitTable && !unitTable.findColumnByName('quantity_precision'))
      await queryRunner.addColumn(unitTable, new TableColumn({ name: 'quantity_precision', type: 'tinyint', unsigned: true, default: 0 }));

    await queryRunner.query(`
      UPDATE tbl_unit_of_measure
      SET allows_decimal_quantity = 1, quantity_precision = 3
      WHERE UPPER(code) IN ('KG', 'KILOGRAM', 'G', 'GRAM', 'L', 'LTR', 'LITRE', 'ML', 'MILLILITRE')
    `);
    await queryRunner.query(`
      UPDATE tbl_product_unit
      SET is_sales_unit = CASE WHEN is_base_unit = 1 AND is_active = 1 THEN 1 ELSE 0 END
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const unitTable = await queryRunner.getTable('tbl_unit_of_measure');
    if (!unitTable) return;
    if (unitTable.findColumnByName('quantity_precision')) await queryRunner.dropColumn(unitTable, 'quantity_precision');
    if (unitTable.findColumnByName('allows_decimal_quantity')) await queryRunner.dropColumn(unitTable, 'allows_decimal_quantity');
  }
}
