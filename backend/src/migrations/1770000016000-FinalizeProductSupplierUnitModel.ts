import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class FinalizeProductSupplierUnitModel1770000016000 implements MigrationInterface {
  name = 'FinalizeProductSupplierUnitModel1770000016000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const priceTableName = 'tbl_product_supplier_price';
    const linkTableName = 'tbl_product_supplier';
    let priceTable = await queryRunner.getTable(priceTableName);
    const linkTable = await queryRunner.getTable(linkTableName);
    if (!priceTable || !linkTable) throw new Error('Supplier purchasing tables do not exist.');

    const supplierUnitColumn = priceTable.findColumnByName('product_supplier_unit_id');
    if (!supplierUnitColumn) throw new Error('product_supplier_unit_id does not exist on supplier prices.');
    const missing = await queryRunner.query(`SELECT COUNT(*) AS missing_count FROM ${priceTableName} WHERE product_supplier_unit_id IS NULL`);
    if (Number(missing[0]?.missing_count ?? 0) > 0) throw new Error('Cannot finalize supplier prices: NULL ProductSupplierUnit links remain.');

    await queryRunner.query(`
      UPDATE tbl_product_supplier_unit psu
      INNER JOIN tbl_product_supplier ps ON ps.product_supplier_id = psu.product_supplier_id
      SET psu.is_default_purchase_unit = 0
      WHERE ps.is_active = 1 AND psu.is_active = 1
    `);
    await queryRunner.query(`
      UPDATE tbl_product_supplier_unit psu
      INNER JOIN (
        SELECT product_supplier_id, MIN(product_supplier_unit_id) AS default_id
        FROM tbl_product_supplier_unit
        WHERE is_active = 1
        GROUP BY product_supplier_id
      ) defaults ON defaults.default_id = psu.product_supplier_unit_id
      INNER JOIN tbl_product_supplier ps ON ps.product_supplier_id = psu.product_supplier_id AND ps.is_active = 1
      SET psu.is_default_purchase_unit = 1
    `);

    priceTable = (await queryRunner.getTable(priceTableName))!;
    for (const foreignKey of priceTable.foreignKeys.filter((key) => key.columnNames.some((column) => ['product_supplier_id', 'product_unit_id', 'product_supplier_unit_id'].includes(column))))
      await queryRunner.dropForeignKey(priceTableName, foreignKey);

    priceTable = (await queryRunner.getTable(priceTableName))!;
    for (const index of priceTable.indices.filter((item) => item.columnNames.some((column) => ['product_supplier_id', 'product_unit_id'].includes(column))))
      await queryRunner.dropIndex(priceTableName, index);

    let refreshedLink = (await queryRunner.getTable(linkTableName))!;
    const obsoleteLinkColumns = ['purchase_unit_id', 'supplier_product_code', 'minimum_order_qty', 'lead_time_days'];
    for (const foreignKey of refreshedLink.foreignKeys.filter((key) => key.columnNames.some((column) => obsoleteLinkColumns.includes(column))))
      await queryRunner.dropForeignKey(linkTableName, foreignKey);
    refreshedLink = (await queryRunner.getTable(linkTableName))!;
    for (const index of refreshedLink.indices.filter((item) => item.columnNames.some((column) => obsoleteLinkColumns.includes(column))))
      await queryRunner.dropIndex(linkTableName, index);

    for (const column of ['product_supplier_id', 'product_unit_id']) {
      if ((await queryRunner.getTable(priceTableName))?.findColumnByName(column)) await queryRunner.dropColumn(priceTableName, column);
    }
    for (const column of obsoleteLinkColumns) {
      if ((await queryRunner.getTable(linkTableName))?.findColumnByName(column)) await queryRunner.dropColumn(linkTableName, column);
    }

    priceTable = (await queryRunner.getTable(priceTableName))!;
    const currentSupplierUnitColumn = priceTable.findColumnByName('product_supplier_unit_id')!;
    if (currentSupplierUnitColumn.isNullable) {
      await queryRunner.changeColumn(priceTableName, currentSupplierUnitColumn, new TableColumn({ name: 'product_supplier_unit_id', type: 'bigint', isNullable: false }));
    }

    priceTable = (await queryRunner.getTable(priceTableName))!;
    if (!priceTable.foreignKeys.some((key) => key.columnNames.length === 1 && key.columnNames[0] === 'product_supplier_unit_id')) {
      await queryRunner.createForeignKey(priceTableName, new TableForeignKey({ name: 'fk_supplier_price_supplier_unit', columnNames: ['product_supplier_unit_id'], referencedTableName: 'tbl_product_supplier_unit', referencedColumnNames: ['product_supplier_unit_id'], onDelete: 'RESTRICT', onUpdate: 'RESTRICT' }));
    }
    priceTable = (await queryRunner.getTable(priceTableName))!;
    if (!priceTable.indices.some((index) => index.name === 'idx_supplier_price_supplier_unit_effective_context')) {
      await queryRunner.createIndex(priceTableName, new TableIndex({ name: 'idx_supplier_price_supplier_unit_effective_context', columnNames: ['product_supplier_unit_id', 'currency_code', 'minimum_quantity', 'effective_from'] }));
    }
  }

  async down(): Promise<void> {
    // Intentionally no-op: restoring redundant ownership columns safely would require reconstructing application history.
  }
}
