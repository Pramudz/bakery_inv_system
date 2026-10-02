import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddInvoiceCollectionReceipts1770000025000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const column of [
      new TableColumn({ name: 'collection_key', type: 'varchar', length: '36', isNullable: true }),
      new TableColumn({ name: 'balance_before', type: 'decimal', precision: 18, scale: 2, isNullable: true }),
      new TableColumn({ name: 'balance_after', type: 'decimal', precision: 18, scale: 2, isNullable: true }),
    ]) {
      if (!(await queryRunner.hasColumn('tbl_invoice_payment', column.name))) await queryRunner.addColumn('tbl_invoice_payment', column);
    }
    const table = await queryRunner.getTable('tbl_invoice_payment');
    if (!table?.indices.some((index) => index.name === 'uq_invoice_payment_collection')) {
      await queryRunner.createIndex('tbl_invoice_payment', new TableIndex({ name: 'uq_invoice_payment_collection', columnNames: ['invoice_id', 'collection_key'], isUnique: true }));
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('tbl_invoice_payment', 'uq_invoice_payment_collection');
    for (const name of ['balance_after', 'balance_before', 'collection_key']) await queryRunner.dropColumn('tbl_invoice_payment', name);
  }
}
