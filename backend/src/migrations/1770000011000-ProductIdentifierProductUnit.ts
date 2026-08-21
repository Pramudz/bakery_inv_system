import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class ProductIdentifierProductUnit1770000011000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    let table = await queryRunner.getTable('tbl_product_identifier');
    if (!table) return;
    if (!table.findColumnByName('product_unit_id'))
      await queryRunner.addColumn(table, new TableColumn({ name: 'product_unit_id', type: 'bigint', isNullable: true }));

    await queryRunner.query(`
      UPDATE tbl_product_identifier identifier
      INNER JOIN tbl_identifier_type identifier_type ON identifier_type.identifier_type_id = identifier.identifier_type_id
      INNER JOIN (
        SELECT product_id, MIN(product_unit_id) AS product_unit_id
        FROM tbl_product_unit
        WHERE is_base_unit = 1 AND is_active = 1
        GROUP BY product_id
        HAVING COUNT(*) = 1
      ) base_unit ON base_unit.product_id = identifier.product_id
      SET identifier.product_unit_id = base_unit.product_unit_id
      WHERE identifier.product_unit_id IS NULL
        AND UPPER(identifier_type.code) IN ('BARCODE', 'EAN', 'UPC', 'GTIN', 'PLU')
    `);

    table = (await queryRunner.getTable('tbl_product_identifier'))!;
    if (!table.foreignKeys.some((key) => key.columnNames.includes('product_unit_id')))
      await queryRunner.createForeignKey(table, new TableForeignKey({ name: 'fk_product_identifier_product_unit', columnNames: ['product_unit_id'], referencedTableName: 'tbl_product_unit', referencedColumnNames: ['product_unit_id'], onDelete: 'RESTRICT' }));
    if (!table.indices.some((index) => index.name === 'idx_product_identifier_product_unit'))
      await queryRunner.createIndex(table, new TableIndex({ name: 'idx_product_identifier_product_unit', columnNames: ['product_unit_id'] }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('tbl_product_identifier');
    if (!table?.findColumnByName('product_unit_id')) return;
    const index = table.indices.find((candidate) => candidate.name === 'idx_product_identifier_product_unit');
    if (index) await queryRunner.dropIndex(table, index);
    const foreignKey = table.foreignKeys.find((candidate) => candidate.columnNames.includes('product_unit_id'));
    if (foreignKey) await queryRunner.dropForeignKey(table, foreignKey);
    await queryRunner.dropColumn(table, 'product_unit_id');
  }
}
