import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class ProductPriceHistoryIndexes1770000001000 implements MigrationInterface {
  name = 'ProductPriceHistoryIndexes1770000001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of ['tbl_price_list_item', 'tbl_product_supplier_price']) {
      const table = await queryRunner.getTable(tableName);
      if (!table) throw new Error(`${tableName} does not exist`);
      for (const columnName of ['effective_from', 'effective_to', 'is_active']) {
        if (!table.findColumnByName(columnName)) {
          if (columnName === 'effective_from')
            await queryRunner.query(`ALTER TABLE ${tableName} ADD COLUMN effective_from datetime NULL`);
          if (columnName === 'effective_to')
            await queryRunner.query(`ALTER TABLE ${tableName} ADD COLUMN effective_to datetime NULL`);
          if (columnName === 'is_active')
            await queryRunner.query(`ALTER TABLE ${tableName} ADD COLUMN is_active tinyint NOT NULL DEFAULT 1`);
        }
      }
      await queryRunner.query(`UPDATE ${tableName} SET effective_from = COALESCE(effective_from, created_at), is_active = COALESCE(is_active, 1)`);
      await queryRunner.query(`ALTER TABLE ${tableName} MODIFY COLUMN effective_from datetime NOT NULL`);
    }

    const selling = (await queryRunner.getTable('tbl_price_list_item'))!;
    if (!selling.indices.some((index) => index.name === 'idx_price_list_item_effective_context'))
      await queryRunner.createIndex(selling, new TableIndex({ name: 'idx_price_list_item_effective_context', columnNames: ['product_id', 'price_list_id', 'unit_id', 'minimum_quantity', 'effective_from'] }));

    const supplier = (await queryRunner.getTable('tbl_product_supplier_price'))!;
    if (!supplier.indices.some((index) => index.name === 'idx_supplier_price_effective_context'))
      await queryRunner.createIndex(supplier, new TableIndex({ name: 'idx_supplier_price_effective_context', columnNames: ['product_supplier_id', 'product_unit_id', 'currency_code', 'minimum_quantity', 'effective_from'] }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const [tableName, indexName] of [
      ['tbl_price_list_item', 'idx_price_list_item_effective_context'],
      ['tbl_product_supplier_price', 'idx_supplier_price_effective_context'],
    ] as const) {
      const table = await queryRunner.getTable(tableName);
      const index = table?.indices.find((candidate) => candidate.name === indexName);
      if (table && index) await queryRunner.dropIndex(table, index);
    }
  }
}
