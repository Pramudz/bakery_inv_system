import {
  MigrationInterface,
  QueryRunner,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class ProductPriceRemovalAndSnapshots1770000005000 implements MigrationInterface {
  name = 'ProductPriceRemovalAndSnapshots1770000005000';

  async up(queryRunner: QueryRunner): Promise<void> {
    let selling = await queryRunner.getTable('tbl_price_list_item');
    if (!selling) throw new Error('tbl_price_list_item does not exist');
    if (!selling.findColumnByName('currency_code'))
      await queryRunner.query("ALTER TABLE tbl_price_list_item ADD COLUMN currency_code varchar(3) NOT NULL DEFAULT 'LKR' AFTER selling_price");

    selling = (await queryRunner.getTable('tbl_price_list_item'))!;
    if (!selling.indices.some((index) => index.name === 'idx_price_list_item_currency_effective_context'))
      await queryRunner.createIndex(
        'tbl_price_list_item',
        new TableIndex({
          name: 'idx_price_list_item_currency_effective_context',
          columnNames: ['product_id', 'price_list_id', 'unit_id', 'currency_code', 'minimum_quantity', 'effective_from'],
        }),
      );

    for (const tableName of ['tbl_purchase_order_line', 'tbl_goods_receipt_line']) {
      let table = await queryRunner.getTable(tableName);
      if (!table) continue;
      if (!table.findColumnByName('source_supplier_price_id'))
        await queryRunner.query(`ALTER TABLE ${tableName} ADD COLUMN source_supplier_price_id bigint NULL`);
      table = (await queryRunner.getTable(tableName))!;
      const indexName = `idx_${tableName.replace('tbl_', '')}_source_supplier_price`;
      if (!table.indices.some((index) => index.name === indexName))
        await queryRunner.createIndex(table, new TableIndex({ name: indexName, columnNames: ['source_supplier_price_id'] }));
      const foreignKeyName = `fk_${tableName.replace('tbl_', '')}_source_supplier_price`;
      if (!table.foreignKeys.some((key) => key.name === foreignKeyName))
        await queryRunner.createForeignKey(
          table,
          new TableForeignKey({
            name: foreignKeyName,
            columnNames: ['source_supplier_price_id'],
            referencedTableName: 'tbl_product_supplier_price',
            referencedColumnNames: ['product_supplier_price_id'],
            onDelete: 'RESTRICT',
          }),
        );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of ['tbl_purchase_order_line', 'tbl_goods_receipt_line']) {
      const table = await queryRunner.getTable(tableName);
      if (!table) continue;
      const foreignKey = table.foreignKeys.find((key) => key.name === `fk_${tableName.replace('tbl_', '')}_source_supplier_price`);
      if (foreignKey) await queryRunner.dropForeignKey(table, foreignKey);
      const index = table.indices.find((candidate) => candidate.name === `idx_${tableName.replace('tbl_', '')}_source_supplier_price`);
      if (index) await queryRunner.dropIndex(table, index);
      if (table.findColumnByName('source_supplier_price_id')) await queryRunner.dropColumn(table, 'source_supplier_price_id');
    }

    const selling = await queryRunner.getTable('tbl_price_list_item');
    if (!selling) return;
    const index = selling.indices.find((candidate) => candidate.name === 'idx_price_list_item_currency_effective_context');
    if (index) await queryRunner.dropIndex(selling, index);
    if (selling.findColumnByName('currency_code')) await queryRunner.dropColumn(selling, 'currency_code');
  }
}
