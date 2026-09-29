import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddInvoiceCreditAuthorization1770000029000 implements MigrationInterface {
  name = 'AddInvoiceCreditAuthorization1770000029000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('tbl_invoice'))) throw new Error('tbl_invoice must exist before adding credit authorization.');
    if (!(await queryRunner.hasTable('tbl_user'))) throw new Error('tbl_user must exist before adding credit authorization.');

    const columns = [
      new TableColumn({ name: 'is_credit_sale', type: 'tinyint', width: 1, default: 0 }),
      new TableColumn({ name: 'credit_authorized_by_user_id', type: 'bigint', isNullable: true }),
      new TableColumn({ name: 'credit_authorized_at', type: 'datetime', isNullable: true }),
    ];
    for (const column of columns) {
      if (!(await queryRunner.hasColumn('tbl_invoice', column.name))) await queryRunner.addColumn('tbl_invoice', column);
    }

    // Existing unpaid invoices remain historical records, not silently reclassified credit sales.
    const table = await queryRunner.getTable('tbl_invoice');
    if (!table?.foreignKeys.some((key) => key.name === 'fk_invoice_credit_authorized_by')) {
      await queryRunner.createForeignKey('tbl_invoice', new TableForeignKey({
        name: 'fk_invoice_credit_authorized_by',
        columnNames: ['credit_authorized_by_user_id'],
        referencedTableName: 'tbl_user',
        referencedColumnNames: ['user_id'],
        onDelete: 'RESTRICT',
      }));
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('tbl_invoice');
    const foreignKey = table?.foreignKeys.find((key) => key.name === 'fk_invoice_credit_authorized_by');
    if (foreignKey) await queryRunner.dropForeignKey('tbl_invoice', foreignKey);
    for (const column of ['credit_authorized_at', 'credit_authorized_by_user_id', 'is_credit_sale']) {
      if (await queryRunner.hasColumn('tbl_invoice', column)) await queryRunner.dropColumn('tbl_invoice', column);
    }
  }
}
