import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class LinkSupplierPricesToSupplierUnits1770000015000
  implements MigrationInterface
{
  name = 'LinkSupplierPricesToSupplierUnits1770000015000';

  async up(queryRunner: QueryRunner): Promise<void> {
    let table = await queryRunner.getTable('tbl_product_supplier_price');

    if (!table) {
      throw new Error('tbl_product_supplier_price does not exist.');
    }

    if (!table.findColumnByName('product_supplier_unit_id')) {
      await queryRunner.addColumn(
        'tbl_product_supplier_price',
        new TableColumn({
          name: 'product_supplier_unit_id',
          type: 'bigint',
          isNullable: true,
        }),
      );
    }

    table = (await queryRunner.getTable('tbl_product_supplier_price'))!;

    if (
      !table.indices.some(
        (index) =>
          index.name === 'idx_supplier_price_supplier_unit_effective_context',
      )
    ) {
      await queryRunner.createIndex(
        'tbl_product_supplier_price',
        new TableIndex({
          name: 'idx_supplier_price_supplier_unit_effective_context',
          columnNames: [
            'product_supplier_unit_id',
            'currency_code',
            'minimum_quantity',
            'effective_from',
          ],
        }),
      );
    }

    table = (await queryRunner.getTable('tbl_product_supplier_price'))!;

    if (
      !table.foreignKeys.some(
        (key) => key.name === 'fk_supplier_price_supplier_unit',
      )
    ) {
      await queryRunner.createForeignKey(
        'tbl_product_supplier_price',
        new TableForeignKey({
          name: 'fk_supplier_price_supplier_unit',
          columnNames: ['product_supplier_unit_id'],
          referencedTableName: 'tbl_product_supplier_unit',
          referencedColumnNames: ['product_supplier_unit_id'],
          onDelete: 'RESTRICT',
          onUpdate: 'RESTRICT',
        }),
      );
    }

    // Populate the new link from the already-verified old combination.
    await queryRunner.query(`
      UPDATE tbl_product_supplier_price psp
      INNER JOIN tbl_product_supplier_unit psu
        ON psu.product_supplier_id = psp.product_supplier_id
       AND psu.product_unit_id = psp.product_unit_id
      SET psp.product_supplier_unit_id = psu.product_supplier_unit_id
      WHERE psp.product_supplier_unit_id IS NULL
    `);

    const missing = await queryRunner.query(`
      SELECT COUNT(*) AS missing_count
      FROM tbl_product_supplier_price
      WHERE product_supplier_unit_id IS NULL
    `);

    if (Number(missing[0]?.missing_count ?? 0) > 0) {
      throw new Error(
        'Cannot link supplier prices: some rows have no ProductSupplierUnit.',
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('tbl_product_supplier_price');

    if (!table) return;

    const foreignKey = table.foreignKeys.find(
      (key) => key.name === 'fk_supplier_price_supplier_unit',
    );

    if (foreignKey) {
      await queryRunner.dropForeignKey(table, foreignKey);
    }

    const index = (await queryRunner.getTable('tbl_product_supplier_price'))
      ?.indices.find(
        (item) =>
          item.name ===
          'idx_supplier_price_supplier_unit_effective_context',
      );

    if (index) {
      await queryRunner.dropIndex('tbl_product_supplier_price', index);
    }

    if (
      (await queryRunner.getTable('tbl_product_supplier_price'))
        ?.findColumnByName('product_supplier_unit_id')
    ) {
      await queryRunner.dropColumn(
        'tbl_product_supplier_price',
        'product_supplier_unit_id',
      );
    }
  }
}