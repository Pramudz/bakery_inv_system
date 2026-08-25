import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class HardenPoGrnInventoryPosting1770000018000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createIndex('tbl_inventory_ledger', new TableIndex({
      name: 'uq_inventory_ledger_source_movement',
      columnNames: ['tenant_id', 'source_document_type', 'source_document_id', 'source_document_line_id', 'movement_type'],
      isUnique: true,
    }));
    await queryRunner.createIndex('tbl_inventory_age_layer', new TableIndex({
      name: 'uq_inventory_age_layer_source',
      columnNames: ['tenant_id', 'source_document_type', 'source_document_id', 'source_document_line_id'],
      isUnique: true,
    }));
    await queryRunner.addColumn('tbl_purchase_order_line', new TableColumn({ name: 'cost_override_reason', type: 'varchar', length: '500', isNullable: true }));
    await queryRunner.addColumn('tbl_goods_receipt_line', new TableColumn({ name: 'cost_override_reason', type: 'varchar', length: '500', isNullable: true }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('tbl_goods_receipt_line', 'cost_override_reason');
    await queryRunner.dropColumn('tbl_purchase_order_line', 'cost_override_reason');
    await queryRunner.dropIndex('tbl_inventory_age_layer', 'uq_inventory_age_layer_source');
    await queryRunner.dropIndex('tbl_inventory_ledger', 'uq_inventory_ledger_source_movement');
  }
}
