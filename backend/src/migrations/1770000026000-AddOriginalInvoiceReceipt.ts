import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddOriginalInvoiceReceipt1770000026000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('tbl_invoice', 'receipt_snapshot'))) {
      await queryRunner.addColumn('tbl_invoice', new TableColumn({ name: 'receipt_snapshot', type: 'json', isNullable: true }));
    }
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('tbl_invoice', 'receipt_snapshot');
  }
}
