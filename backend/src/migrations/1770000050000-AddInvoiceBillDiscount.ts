import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddInvoiceBillDiscount1770000050000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const add = async (table: string, column: TableColumn) => {
      if (!(await runner.hasColumn(table, column.name))) await runner.addColumn(table, column);
    };
    await add('tbl_invoice', new TableColumn({ name: 'item_discount_total', type: 'decimal', precision: 18, scale: 2, default: 0 }));
    await add('tbl_invoice', new TableColumn({ name: 'bill_discount_type', type: 'varchar', length: '20', isNullable: true }));
    await add('tbl_invoice', new TableColumn({ name: 'bill_discount_value', type: 'decimal', precision: 12, scale: 4, default: 0 }));
    await add('tbl_invoice', new TableColumn({ name: 'bill_discount_total', type: 'decimal', precision: 18, scale: 2, default: 0 }));
    await add('tbl_invoice', new TableColumn({ name: 'bill_discount_applied_by_user_id', type: 'bigint', isNullable: true }));
    await add('tbl_invoice', new TableColumn({ name: 'bill_discount_applied_at', type: 'datetime', isNullable: true }));
    await add('tbl_invoice_detail', new TableColumn({ name: 'net_before_bill_discount', type: 'decimal', precision: 18, scale: 2, default: 0 }));
    await add('tbl_invoice_detail', new TableColumn({ name: 'bill_discount_allocated', type: 'decimal', precision: 18, scale: 2, default: 0 }));
    await add('tbl_invoice_refund_detail', new TableColumn({ name: 'bill_discount_allocated', type: 'decimal', precision: 18, scale: 2, default: 0 }));
    // Historical commercial amounts stay intact; the new breakdown describes their existing values.
    await runner.query('UPDATE tbl_invoice SET item_discount_total = discount_total WHERE bill_discount_total = 0');
    await runner.query('UPDATE tbl_invoice_detail SET net_before_bill_discount = net_total WHERE bill_discount_allocated = 0');
    const table = await runner.getTable('tbl_invoice');
    if (!table?.foreignKeys.some((key) => key.name === 'fk_invoice_bill_discount_user')) {
      await runner.createForeignKey('tbl_invoice', new TableForeignKey({ name: 'fk_invoice_bill_discount_user', columnNames: ['bill_discount_applied_by_user_id'], referencedTableName: 'tbl_user', referencedColumnNames: ['user_id'], onDelete: 'RESTRICT' }));
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    const used: Array<{ count: number }> = await runner.query('SELECT COUNT(*) AS count FROM tbl_invoice WHERE bill_discount_total <> 0');
    if (Number(used[0]?.count ?? 0) > 0) throw new Error('Cannot remove bill discount columns while discounted invoices exist.');
    const table = await runner.getTable('tbl_invoice');
    const foreignKey = table?.foreignKeys.find((key) => key.name === 'fk_invoice_bill_discount_user');
    if (foreignKey) await runner.dropForeignKey('tbl_invoice', foreignKey);
    if (await runner.hasColumn('tbl_invoice_refund_detail', 'bill_discount_allocated')) await runner.dropColumn('tbl_invoice_refund_detail', 'bill_discount_allocated');
    for (const column of ['bill_discount_allocated', 'net_before_bill_discount']) if (await runner.hasColumn('tbl_invoice_detail', column)) await runner.dropColumn('tbl_invoice_detail', column);
    for (const column of ['bill_discount_applied_at', 'bill_discount_applied_by_user_id', 'bill_discount_total', 'bill_discount_value', 'bill_discount_type', 'item_discount_total']) if (await runner.hasColumn('tbl_invoice', column)) await runner.dropColumn('tbl_invoice', column);
  }
}
