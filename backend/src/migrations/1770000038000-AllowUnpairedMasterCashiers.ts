import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowUnpairedMasterCashiers1770000038000 implements MigrationInterface {
  name = 'AllowUnpairedMasterCashiers1770000038000';
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE tbl_pos_cashier_session MODIFY COLUMN pos_terminal_id bigint NULL');
  }
  async down(q: QueryRunner): Promise<void> {
    const rows: Array<{ count: string }> = await q.query('SELECT COUNT(*) AS count FROM tbl_pos_cashier_session WHERE pos_terminal_id IS NULL');
    if (Number(rows[0].count)) throw new Error('Unpaired master cashier history exists. Preserve it before downgrading.');
    await q.query('ALTER TABLE tbl_pos_cashier_session MODIFY COLUMN pos_terminal_id bigint NOT NULL');
  }
}
