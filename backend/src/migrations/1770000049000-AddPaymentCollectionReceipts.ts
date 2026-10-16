import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentCollectionReceipts1770000049000 implements MigrationInterface {
  name = 'AddPaymentCollectionReceipts1770000049000';
  async up(q: QueryRunner): Promise<void> {
    if (!(await q.hasColumn('tbl_invoice_payment', 'receipt_snapshot')))
      await q.query('ALTER TABLE tbl_invoice_payment ADD COLUMN receipt_snapshot json NULL');
    for (const table of ['tbl_pos_print_job', 'tbl_pos_receipt_reprint']) {
      const column = (await q.getTable(table))?.findColumnByName('document_type');
      if (!column) throw new Error(`${table}.document_type is missing`);
      if (column.length !== '24') await q.query(`ALTER TABLE ${table} MODIFY COLUMN document_type varchar(24) NOT NULL`);
    }
  }
  async down(q: QueryRunner): Promise<void> {
    const [jobs] = await q.query("SELECT COUNT(*) AS count FROM tbl_pos_print_job WHERE document_type = 'PAYMENT_COLLECTION'");
    const [reprints] = await q.query("SELECT COUNT(*) AS count FROM tbl_pos_receipt_reprint WHERE document_type = 'PAYMENT_COLLECTION'");
    const [snapshots] = await q.query('SELECT COUNT(*) AS count FROM tbl_invoice_payment WHERE receipt_snapshot IS NOT NULL');
    if (Number(jobs.count) || Number(reprints.count) || Number(snapshots.count)) {
      throw new Error('Cannot remove payment collection receipt storage while archived receipts or print audits exist');
    }
    for (const table of ['tbl_pos_receipt_reprint', 'tbl_pos_print_job']) {
      const column = (await q.getTable(table))?.findColumnByName('document_type');
      if (!column) throw new Error(`${table}.document_type is missing`);
      if (column.length !== '10') await q.query(`ALTER TABLE ${table} MODIFY COLUMN document_type varchar(10) NOT NULL`);
    }
    if (await q.hasColumn('tbl_invoice_payment', 'receipt_snapshot'))
      await q.query('ALTER TABLE tbl_invoice_payment DROP COLUMN receipt_snapshot');
  }
}
