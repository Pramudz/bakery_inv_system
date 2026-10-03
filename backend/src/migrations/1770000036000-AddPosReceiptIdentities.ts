import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPosReceiptIdentities1770000036000 implements MigrationInterface {
  name = 'AddPosReceiptIdentities1770000036000';

  async up(q: QueryRunner): Promise<void> {
    const reserved: Array<{ pos_terminal_id: string }> = await q.query(
      `SELECT pos_terminal_id FROM tbl_pos_terminal WHERE UPPER(TRIM(terminal_code)) = 'MASTER' LIMIT 1`,
    );
    if (reserved.length) throw new Error('Terminal code MASTER is reserved for printed master-register receipts. Rename the terminal before migrating.');
    // Existing documents remain legacy records. Their old ID-derived references are not
    // converted into a printed identity that was never issued to the customer.
    await q.query(`ALTER TABLE tbl_invoice
      ADD COLUMN business_date date NULL,
      ADD COLUMN bill_no int unsigned NULL,
      ADD COLUMN printed_location_code varchar(50) NULL,
      ADD COLUMN printed_register_code varchar(50) NULL,
      ADD COLUMN issued_at datetime(3) NULL`);
    await q.query(`CREATE UNIQUE INDEX uq_invoice_printed_bill
      ON tbl_invoice (tenant_id, business_date, printed_location_code, printed_register_code, bill_no)`);
    await q.query(`ALTER TABLE tbl_invoice_refund
      ADD COLUMN business_date date NULL,
      ADD COLUMN refund_no int unsigned NULL,
      ADD COLUMN printed_location_code varchar(50) NULL,
      ADD COLUMN printed_register_code varchar(50) NULL,
      ADD COLUMN issued_at datetime(3) NULL,
      ADD COLUMN receipt_snapshot json NULL`);
    await q.query(`CREATE UNIQUE INDEX uq_refund_printed_number
      ON tbl_invoice_refund (tenant_id, business_date, printed_location_code, refund_no)`);
    await q.query(`CREATE TABLE tbl_pos_receipt_counter (
      kind varchar(8) NOT NULL,
      tenant_id bigint NOT NULL,
      business_date date NOT NULL,
      location_code varchar(50) NOT NULL,
      register_code varchar(50) NOT NULL,
      last_number int unsigned NOT NULL DEFAULT 0,
      PRIMARY KEY (kind, tenant_id, business_date, location_code, register_code)
    ) ENGINE=InnoDB`);
    await q.query(`ALTER TABLE tbl_pos_cash_register ADD COLUMN receipt_code varchar(50) NULL`);
    await q.query(`UPDATE tbl_pos_cash_register SET receipt_code = 'MASTER' WHERE register_mode = 'MASTER_REGISTER'`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE tbl_pos_cash_register DROP COLUMN receipt_code`);
    await q.query(`DROP TABLE tbl_pos_receipt_counter`);
    await q.query(`DROP INDEX uq_refund_printed_number ON tbl_invoice_refund`);
    await q.query(`ALTER TABLE tbl_invoice_refund
      DROP COLUMN business_date, DROP COLUMN refund_no, DROP COLUMN printed_location_code,
      DROP COLUMN printed_register_code, DROP COLUMN issued_at, DROP COLUMN receipt_snapshot`);
    await q.query(`DROP INDEX uq_invoice_printed_bill ON tbl_invoice`);
    await q.query(`ALTER TABLE tbl_invoice
      DROP COLUMN business_date, DROP COLUMN bill_no, DROP COLUMN printed_location_code,
      DROP COLUMN printed_register_code, DROP COLUMN issued_at`);
  }
}
