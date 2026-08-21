import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class ProductRelationshipIntegrityAndUnitSnapshots1770000008000 implements MigrationInterface {
  name = 'ProductRelationshipIntegrityAndUnitSnapshots1770000008000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const uniqueDefinitions = [
      { table: 'tbl_product_supplier', index: 'uq_product_supplier_product_supplier', columns: ['product_id', 'supplier_id'], id: 'product_supplier_id' },
      { table: 'tbl_product_unit', index: 'uq_product_unit_product_unit', columns: ['product_id', 'unit_id'], id: 'product_unit_id' },
      { table: 'tbl_product_location', index: 'uq_product_location_product_location', columns: ['product_id', 'location_id'], id: 'product_location_id' },
    ];

    for (const definition of uniqueDefinitions) {
      const duplicates = await queryRunner.query(
        `SELECT ${definition.columns.join(', ')}, COUNT(*) duplicate_count, GROUP_CONCAT(${definition.id} ORDER BY ${definition.id}) row_ids
         FROM ${definition.table}
         GROUP BY ${definition.columns.join(', ')}
         HAVING COUNT(*) > 1`,
      );
      if (duplicates.length)
        throw new Error(
          `Cannot add ${definition.index}; duplicate rows require manual cleanup: ${JSON.stringify(duplicates)}`,
        );
      const table = await queryRunner.getTable(definition.table);
      if (!table) throw new Error(`${definition.table} does not exist`);
      if (!table.indices.some((index) => index.name === definition.index))
        await queryRunner.createIndex(
          table,
          new TableIndex({ name: definition.index, columnNames: definition.columns, isUnique: true }),
        );
    }

    for (const tableName of ['tbl_purchase_order_line', 'tbl_goods_receipt_line']) {
      let table = await queryRunner.getTable(tableName);
      if (!table) throw new Error(`${tableName} does not exist`);
      if (!table.findColumnByName('product_unit_id'))
        await queryRunner.addColumn(table, new TableColumn({ name: 'product_unit_id', type: 'bigint', isNullable: true }));
      if (!table.findColumnByName('conversion_factor_snapshot'))
        await queryRunner.addColumn(table, new TableColumn({ name: 'conversion_factor_snapshot', type: 'decimal', precision: 18, scale: 6, isNullable: true }));
      table = (await queryRunner.getTable(tableName))!;
      const indexName = `idx_${tableName.replace('tbl_', '')}_product_unit`;
      if (!table.indices.some((index) => index.name === indexName))
        await queryRunner.createIndex(table, new TableIndex({ name: indexName, columnNames: ['product_unit_id'] }));
      const foreignKeyName = `fk_${tableName.replace('tbl_', '')}_product_unit`;
      if (!table.foreignKeys.some((key) => key.name === foreignKeyName))
        await queryRunner.createForeignKey(
          table,
          new TableForeignKey({
            name: foreignKeyName,
            columnNames: ['product_unit_id'],
            referencedTableName: 'tbl_product_unit',
            referencedColumnNames: ['product_unit_id'],
            onDelete: 'RESTRICT',
          }),
        );
    }

    await queryRunner.query(`
      UPDATE tbl_purchase_order_line line
      INNER JOIN tbl_product product ON product.product_id = line.product_id AND product.base_unit_id = line.unit_id
      INNER JOIN tbl_product_unit product_unit ON product_unit.product_id = line.product_id
        AND product_unit.unit_id = line.unit_id AND product_unit.conversion_factor = 1
      SET line.product_unit_id = product_unit.product_unit_id,
          line.conversion_factor_snapshot = 1
      WHERE line.product_unit_id IS NULL
        AND (SELECT COUNT(*) FROM tbl_product_unit candidate
             WHERE candidate.product_id = line.product_id AND candidate.unit_id = line.unit_id) = 1
    `);
    await queryRunner.query(`
      UPDATE tbl_goods_receipt_line receipt_line
      INNER JOIN tbl_purchase_order_line order_line ON order_line.purchase_order_line_id = receipt_line.purchase_order_line_id
      SET receipt_line.product_unit_id = order_line.product_unit_id,
          receipt_line.conversion_factor_snapshot = order_line.conversion_factor_snapshot
      WHERE receipt_line.product_unit_id IS NULL AND order_line.product_unit_id IS NOT NULL
    `);
    await queryRunner.query(`
      UPDATE tbl_goods_receipt_line line
      INNER JOIN tbl_product product ON product.product_id = line.product_id AND product.base_unit_id = line.unit_id
      INNER JOIN tbl_product_unit product_unit ON product_unit.product_id = line.product_id
        AND product_unit.unit_id = line.unit_id AND product_unit.conversion_factor = 1
      SET line.product_unit_id = product_unit.product_unit_id,
          line.conversion_factor_snapshot = 1
      WHERE line.product_unit_id IS NULL
        AND (SELECT COUNT(*) FROM tbl_product_unit candidate
             WHERE candidate.product_id = line.product_id AND candidate.unit_id = line.unit_id) = 1
    `);

    for (const definition of [
      { table: 'tbl_purchase_order_line', id: 'purchase_order_line_id' },
      { table: 'tbl_goods_receipt_line', id: 'goods_receipt_line_id' },
    ]) {
      const uncertain = await queryRunner.query(
        `SELECT ${definition.id}, product_id, unit_id FROM ${definition.table}
         WHERE product_unit_id IS NULL OR conversion_factor_snapshot IS NULL
         ORDER BY ${definition.id}`,
      );
      if (uncertain.length)
        console.warn(
          `[migration ${this.name}] Historical rows not backfilled because their conversion snapshot is uncertain: ${JSON.stringify(uncertain)}`,
        );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of ['tbl_goods_receipt_line', 'tbl_purchase_order_line']) {
      let table = await queryRunner.getTable(tableName);
      if (!table) continue;
      const foreignKey = table.foreignKeys.find((key) => key.name === `fk_${tableName.replace('tbl_', '')}_product_unit`);
      if (foreignKey) await queryRunner.dropForeignKey(table, foreignKey);
      const index = table.indices.find((candidate) => candidate.name === `idx_${tableName.replace('tbl_', '')}_product_unit`);
      if (index) await queryRunner.dropIndex(table, index);
      table = (await queryRunner.getTable(tableName))!;
      if (table.findColumnByName('conversion_factor_snapshot')) await queryRunner.dropColumn(table, 'conversion_factor_snapshot');
      table = (await queryRunner.getTable(tableName))!;
      if (table.findColumnByName('product_unit_id')) await queryRunner.dropColumn(table, 'product_unit_id');
    }
    for (const definition of [
      { table: 'tbl_product_supplier', index: 'uq_product_supplier_product_supplier' },
      { table: 'tbl_product_unit', index: 'uq_product_unit_product_unit' },
      { table: 'tbl_product_location', index: 'uq_product_location_product_location' },
    ]) {
      const table = await queryRunner.getTable(definition.table);
      const index = table?.indices.find((candidate) => candidate.name === definition.index);
      if (table && index) await queryRunner.dropIndex(table, index);
    }
  }
}
