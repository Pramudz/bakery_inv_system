import { MigrationInterface, QueryRunner, Table } from 'typeorm';

const auditColumns = [
  { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
  { name: 'updated_at', type: 'datetime', isNullable: true, default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
];

export class AddMasterCashierBatches1770000033000 implements MigrationInterface {
  name = 'AddMasterCashierBatches1770000033000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['tbl_pos_cash_reconciliation', 'tbl_pos_register_session', 'tbl_pos_cashier_session', 'tbl_invoice_payment']) {
      if (!(await queryRunner.hasTable(table))) throw new Error(`${table} must exist before adding master cash batches.`);
    }
    const addsMasterShape = !(await queryRunner.hasColumn('tbl_pos_cash_reconciliation', 'reconciliation_type'));
    await this.addColumn(queryRunner, 'reconciliation_type', "enum('TERMINAL_CASH_COUNT','MASTER_CASH_BATCH') NOT NULL DEFAULT 'TERMINAL_CASH_COUNT'");
    await this.addColumn(queryRunner, 'submission_fingerprint', 'char(64) NULL');
    if (addsMasterShape) {
      await queryRunner.query('ALTER TABLE tbl_pos_cash_reconciliation MODIFY counted_cash decimal(18,2) NULL');
      await queryRunner.query('ALTER TABLE tbl_pos_cash_reconciliation MODIFY cashier_variance decimal(18,2) NULL');
    }
    await this.addColumn(queryRunner, 'verification_fingerprint', 'char(64) NULL');
    await this.addColumn(queryRunner, 'confirmed_net_cash', 'decimal(18,2) NULL');
    await this.addColumn(queryRunner, 'confirmation_variance', 'decimal(18,2) NULL');
    await this.addColumn(queryRunner, 'physical_recipient_identity', 'varchar(150) NULL');
    await this.addColumn(queryRunner, 'verification_reason', 'varchar(255) NULL');

    if (!(await queryRunner.hasTable('tbl_pos_cash_reconciliation_payment'))) {
      await queryRunner.createTable(new Table({
        name: 'tbl_pos_cash_reconciliation_payment',
        columns: [
          { name: 'pos_cash_reconciliation_payment_id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'tenant_id', type: 'bigint' }, { name: 'location_id', type: 'bigint' },
          { name: 'pos_cash_reconciliation_id', type: 'bigint' }, { name: 'pos_register_session_id', type: 'bigint' },
          { name: 'pos_cashier_session_id', type: 'bigint' }, { name: 'invoice_payment_id', type: 'bigint' },
          { name: 'payment_method_type_snapshot', type: 'varchar', length: '20', isNullable: true },
          { name: 'applied_amount_snapshot', type: 'decimal', precision: 18, scale: 2 },
          { name: 'tendered_amount_snapshot', type: 'decimal', precision: 18, scale: 2 },
          { name: 'change_amount_snapshot', type: 'decimal', precision: 18, scale: 2 },
          { name: 'collection_key_snapshot', type: 'varchar', length: '36', isNullable: true },
          { name: 'paid_at_snapshot', type: 'datetime' },
          { name: 'was_reversed_at_submission', type: 'tinyint', width: 1, default: 0 },
          { name: 'coverage_status', type: 'enum', enum: ['ACTIVE', 'RELEASED'] },
          ...auditColumns,
        ],
        indices: [
          { name: 'uq_pos_reconciliation_payment_item', columnNames: ['pos_cash_reconciliation_id', 'invoice_payment_id'], isUnique: true },
          { name: 'ix_pos_reconciliation_payment_cashier', columnNames: ['pos_cashier_session_id', 'coverage_status'] },
        ],
        foreignKeys: [
          { name: 'fk_pos_reconciliation_payment_tenant', columnNames: ['tenant_id'], referencedTableName: 'tbl_tenant', referencedColumnNames: ['tenant_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_reconciliation_payment_location', columnNames: ['location_id'], referencedTableName: 'tbl_location', referencedColumnNames: ['location_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_reconciliation_payment_reconciliation', columnNames: ['pos_cash_reconciliation_id'], referencedTableName: 'tbl_pos_cash_reconciliation', referencedColumnNames: ['pos_cash_reconciliation_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_reconciliation_payment_register', columnNames: ['pos_register_session_id'], referencedTableName: 'tbl_pos_register_session', referencedColumnNames: ['pos_register_session_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_reconciliation_payment_cashier', columnNames: ['pos_cashier_session_id'], referencedTableName: 'tbl_pos_cashier_session', referencedColumnNames: ['pos_cashier_session_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_reconciliation_payment_invoice_payment', columnNames: ['invoice_payment_id'], referencedTableName: 'tbl_invoice_payment', referencedColumnNames: ['invoice_payment_id'], onDelete: 'RESTRICT' },
        ],
      }));
      await queryRunner.query("ALTER TABLE tbl_pos_cash_reconciliation_payment ADD COLUMN active_payment_guard bigint GENERATED ALWAYS AS (CASE WHEN coverage_status = 'ACTIVE' THEN invoice_payment_id ELSE NULL END) STORED");
      await queryRunner.query('CREATE UNIQUE INDEX uq_pos_reconciliation_payment_active ON tbl_pos_cash_reconciliation_payment (tenant_id, active_payment_guard)');
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('tbl_pos_cash_reconciliation_payment')) await queryRunner.query('DROP TABLE tbl_pos_cash_reconciliation_payment');
    for (const column of ['verification_reason', 'physical_recipient_identity', 'confirmation_variance', 'confirmed_net_cash', 'verification_fingerprint', 'submission_fingerprint', 'reconciliation_type']) {
      if (await queryRunner.hasColumn('tbl_pos_cash_reconciliation', column)) await queryRunner.query(`ALTER TABLE tbl_pos_cash_reconciliation DROP COLUMN ${column}`);
    }
    await queryRunner.query("UPDATE tbl_pos_cash_reconciliation SET counted_cash = 0, cashier_variance = 0 WHERE counted_cash IS NULL OR cashier_variance IS NULL");
    await queryRunner.query('ALTER TABLE tbl_pos_cash_reconciliation MODIFY counted_cash decimal(18,2) NOT NULL');
    await queryRunner.query('ALTER TABLE tbl_pos_cash_reconciliation MODIFY cashier_variance decimal(18,2) NOT NULL');
  }

  private async addColumn(queryRunner: QueryRunner, name: string, definition: string) {
    if (!(await queryRunner.hasColumn('tbl_pos_cash_reconciliation', name))) await queryRunner.query(`ALTER TABLE tbl_pos_cash_reconciliation ADD COLUMN ${name} ${definition}`);
  }
}
