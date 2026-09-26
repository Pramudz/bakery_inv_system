import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from 'typeorm';

export class AddProductSupplierUnits1770000013000
  implements MigrationInterface
{
  name = 'AddProductSupplierUnits1770000013000';

  async up(queryRunner: QueryRunner): Promise<void> {
    let table = await queryRunner.getTable('tbl_product_supplier_unit');

    if (!table) {
      await queryRunner.createTable(
        new Table({
          name: 'tbl_product_supplier_unit',
          columns: [
            {
              name: 'created_at',
              type: 'datetime',
              isNullable: false,
              default: 'CURRENT_TIMESTAMP',
            },
            {
              name: 'updated_at',
              type: 'datetime',
              isNullable: false,
              default: 'CURRENT_TIMESTAMP',
              onUpdate: 'CURRENT_TIMESTAMP',
            },
            {
              name: 'product_supplier_unit_id',
              type: 'bigint',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'increment',
            },
            {
              name: 'product_supplier_id',
              type: 'bigint',
              isNullable: false,
            },
            {
              name: 'product_unit_id',
              type: 'bigint',
              isNullable: false,
            },
            {
              name: 'supplier_product_code',
              type: 'varchar',
              length: '100',
              isNullable: true,
            },
            {
              name: 'minimum_order_qty',
              type: 'decimal',
              precision: 18,
              scale: 6,
              isNullable: true,
            },
            {
              name: 'lead_time_days',
              type: 'int',
              isNullable: true,
            },
            {
              name: 'is_default_purchase_unit',
              type: 'tinyint',
              isNullable: false,
              default: '0',
            },
            {
              name: 'is_active',
              type: 'tinyint',
              isNullable: false,
              default: '1',
            },
          ],
          uniques: [
            {
              name: 'uq_product_supplier_unit_supplier_unit',
              columnNames: ['product_supplier_id', 'product_unit_id'],
            },
          ],
        }),
      );
    }

    table = (await queryRunner.getTable('tbl_product_supplier_unit'))!;

    if (
      !table.foreignKeys.some(
        (key) => key.name === 'fk_product_supplier_unit_supplier',
      )
    ) {
      await queryRunner.createForeignKey(
        table,
        new TableForeignKey({
          name: 'fk_product_supplier_unit_supplier',
          columnNames: ['product_supplier_id'],
          referencedTableName: 'tbl_product_supplier',
          referencedColumnNames: ['product_supplier_id'],
          onDelete: 'RESTRICT',
          onUpdate: 'RESTRICT',
        }),
      );
    }

    table = (await queryRunner.getTable('tbl_product_supplier_unit'))!;

    if (
      !table.foreignKeys.some(
        (key) => key.name === 'fk_product_supplier_unit_product_unit',
      )
    ) {
      await queryRunner.createForeignKey(
        table,
        new TableForeignKey({
          name: 'fk_product_supplier_unit_product_unit',
          columnNames: ['product_unit_id'],
          referencedTableName: 'tbl_product_unit',
          referencedColumnNames: ['product_unit_id'],
          onDelete: 'RESTRICT',
          onUpdate: 'RESTRICT',
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('tbl_product_supplier_unit');

    if (table) {
      await queryRunner.dropTable('tbl_product_supplier_unit', true, true, true);
    }
  }
}