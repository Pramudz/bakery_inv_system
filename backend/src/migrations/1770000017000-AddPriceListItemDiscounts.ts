import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class AddPriceListItemDiscounts1770000017000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: 'tbl_price_list_item_discount',
      columns: [
        { name: 'price_list_item_discount_id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'tenant_id', type: 'bigint' },
        { name: 'price_list_item_id', type: 'bigint' },
        { name: 'discount_type', type: 'enum', enum: ['PERCENTAGE', 'FIXED_AMOUNT'] },
        { name: 'discount_value', type: 'decimal', precision: 18, scale: 4 },
        { name: 'effective_from', type: 'datetime', precision: 3 },
        { name: 'effective_to', type: 'datetime', precision: 3, isNullable: true },
        { name: 'is_active', type: 'tinyint', width: 1, default: true },
        { name: 'created_by', type: 'bigint' },
        { name: 'ended_by', type: 'bigint', isNullable: true },
        { name: 'created_at', type: 'datetime', precision: 6, default: 'CURRENT_TIMESTAMP(6)' },
        { name: 'updated_at', type: 'datetime', precision: 6, isNullable: true, default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)' },
      ],
    }), true);
    for (const foreignKey of [
      new TableForeignKey({ columnNames: ['tenant_id'], referencedTableName: 'tbl_tenant', referencedColumnNames: ['tenant_id'], onDelete: 'RESTRICT' }),
      new TableForeignKey({ columnNames: ['price_list_item_id'], referencedTableName: 'tbl_price_list_item', referencedColumnNames: ['price_list_item_id'], onDelete: 'RESTRICT' }),
      new TableForeignKey({ columnNames: ['created_by'], referencedTableName: 'tbl_user', referencedColumnNames: ['user_id'], onDelete: 'RESTRICT' }),
      new TableForeignKey({ columnNames: ['ended_by'], referencedTableName: 'tbl_user', referencedColumnNames: ['user_id'], onDelete: 'RESTRICT' }),
    ]) await queryRunner.createForeignKey('tbl_price_list_item_discount', foreignKey);
    await queryRunner.createIndex('tbl_price_list_item_discount', new TableIndex({ name: 'idx_price_item_discount_active_period', columnNames: ['tenant_id', 'price_list_item_id', 'is_active', 'effective_from', 'effective_to'] }));
    await queryRunner.createIndex('tbl_price_list_item_discount', new TableIndex({ name: 'idx_price_item_discount_history', columnNames: ['tenant_id', 'price_list_item_id', 'effective_from'] }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('tbl_price_list_item_discount', true);
  }
}
