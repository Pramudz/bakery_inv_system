import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class SellingPriceProductUnitContext1770000009000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    let table = await queryRunner.getTable('tbl_price_list_item');
    if (!table) return;
    if (!table.findColumnByName('tenant_id'))
      await queryRunner.addColumn(table, new TableColumn({ name: 'tenant_id', type: 'bigint', isNullable: true }));
    if (!table.findColumnByName('product_unit_id'))
      await queryRunner.addColumn(table, new TableColumn({ name: 'product_unit_id', type: 'bigint', isNullable: true }));
    await queryRunner.query('ALTER TABLE tbl_price_list_item MODIFY effective_from datetime(3) NOT NULL, MODIFY effective_to datetime(3) NULL');
    await queryRunner.query(`
      UPDATE tbl_price_list_item item
      INNER JOIN tbl_product product ON product.product_id = item.product_id
      SET item.tenant_id = product.tenant_id
      WHERE item.tenant_id IS NULL
    `);
    await queryRunner.query(`
      UPDATE tbl_price_list_item item
      INNER JOIN tbl_product_unit product_unit
        ON product_unit.product_id = item.product_id AND product_unit.unit_id = item.unit_id
      SET item.product_unit_id = product_unit.product_unit_id
      WHERE item.product_unit_id IS NULL
    `);
    const unresolved: Array<{ price_list_item_id: number }> = await queryRunner.query(
      'SELECT price_list_item_id FROM tbl_price_list_item WHERE tenant_id IS NULL OR product_unit_id IS NULL ORDER BY price_list_item_id LIMIT 100',
    );
    if (unresolved.length)
      throw new Error(`Cannot migrate selling prices because ProductUnit mappings are missing for PriceListItem IDs: ${unresolved.map((row) => row.price_list_item_id).join(', ')}`);
    await queryRunner.changeColumn('tbl_price_list_item', 'tenant_id', new TableColumn({ name: 'tenant_id', type: 'bigint', isNullable: false }));
    await queryRunner.changeColumn('tbl_price_list_item', 'product_unit_id', new TableColumn({ name: 'product_unit_id', type: 'bigint', isNullable: false }));
    table = (await queryRunner.getTable('tbl_price_list_item'))!;
    if (!table.foreignKeys.some((key) => key.columnNames.join() === 'tenant_id'))
      await queryRunner.createForeignKey(table, new TableForeignKey({ name: 'fk_price_list_item_tenant', columnNames: ['tenant_id'], referencedTableName: 'tbl_tenant', referencedColumnNames: ['tenant_id'], onDelete: 'RESTRICT' }));
    if (!table.foreignKeys.some((key) => key.columnNames.join() === 'product_unit_id'))
      await queryRunner.createForeignKey(table, new TableForeignKey({ name: 'fk_price_list_item_product_unit', columnNames: ['product_unit_id'], referencedTableName: 'tbl_product_unit', referencedColumnNames: ['product_unit_id'], onDelete: 'RESTRICT' }));
    if (!table.indices.some((index) => index.name === 'idx_selling_price_tenant_context'))
      await queryRunner.createIndex(table, new TableIndex({ name: 'idx_selling_price_tenant_context', columnNames: ['tenant_id', 'product_id', 'price_list_id', 'product_unit_id', 'minimum_quantity', 'effective_from'] }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('tbl_price_list_item');
    if (!table) return;
    const index = table.indices.find((value) => value.name === 'idx_selling_price_tenant_context');
    if (index) await queryRunner.dropIndex(table, index);
    for (const columnName of ['product_unit_id', 'tenant_id']) {
      const refreshed = await queryRunner.getTable('tbl_price_list_item');
      const foreignKey = refreshed?.foreignKeys.find((key) => key.columnNames.includes(columnName));
      if (foreignKey) await queryRunner.dropForeignKey(refreshed!, foreignKey);
      if (refreshed?.findColumnByName(columnName)) await queryRunner.dropColumn(refreshed, columnName);
    }
    await queryRunner.query('ALTER TABLE tbl_price_list_item MODIFY effective_from datetime NOT NULL, MODIFY effective_to datetime NULL');
  }
}
