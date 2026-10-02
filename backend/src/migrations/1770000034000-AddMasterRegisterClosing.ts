import { MigrationInterface, QueryRunner, Table } from 'typeorm';

const auditColumns = [
  { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
  { name: 'updated_at', type: 'datetime', isNullable: true, default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
];

export class AddMasterRegisterClosing1770000034000 implements MigrationInterface {
  name = 'AddMasterRegisterClosing1770000034000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['tbl_pos_cash_movement', 'tbl_pos_register_session', 'tbl_tenant', 'tbl_location', 'tbl_user']) {
      if (!(await queryRunner.hasTable(table))) throw new Error(`${table} must exist before adding master register closing.`);
    }
    if (!(await queryRunner.hasColumn('tbl_pos_cash_movement', 'funding_source'))) {
      await queryRunner.query("ALTER TABLE tbl_pos_cash_movement MODIFY pos_cashier_session_id bigint NULL");
      await queryRunner.query("ALTER TABLE tbl_pos_cash_movement ADD COLUMN funding_source enum('CASHIER_SESSION','MASTER_REGISTER') NOT NULL DEFAULT 'CASHIER_SESSION'");
    }
    await this.addMovementColumn(queryRunner, 'physical_payer_identity', 'varchar(150) NULL');
    await this.addMovementColumn(queryRunner, 'payout_key', 'varchar(36) NULL');
    await this.addMovementColumn(queryRunner, 'payout_fingerprint', 'char(64) NULL');
    const payoutIndex: any[] = await queryRunner.query("SELECT index_name FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'tbl_pos_cash_movement' AND index_name = 'uq_pos_cash_movement_payout_key'");
    if (!payoutIndex.length) await queryRunner.query('CREATE UNIQUE INDEX uq_pos_cash_movement_payout_key ON tbl_pos_cash_movement (tenant_id, payout_key)');

    if (!(await queryRunner.hasTable('tbl_pos_master_reconciliation'))) {
      await queryRunner.createTable(new Table({
        name: 'tbl_pos_master_reconciliation',
        columns: [
          { name: 'pos_master_reconciliation_id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'tenant_id', type: 'bigint' }, { name: 'location_id', type: 'bigint' }, { name: 'pos_register_session_id', type: 'bigint' },
          { name: 'attempt_number', type: 'int' }, { name: 'submission_key', type: 'varchar', length: '36' }, { name: 'submission_fingerprint', type: 'char', length: '64' },
          { name: 'opening_balance', type: 'decimal', precision: 18, scale: 2 },
          { name: 'system_expected_cash', type: 'decimal', precision: 18, scale: 2 },
          { name: 'confirmed_batch_cash_basis', type: 'decimal', precision: 18, scale: 2 },
          { name: 'batch_confirmation_difference', type: 'decimal', precision: 18, scale: 2 },
          { name: 'counted_cash', type: 'decimal', precision: 18, scale: 2 },
          { name: 'count_vs_confirmed_basis', type: 'decimal', precision: 18, scale: 2 },
          { name: 'count_vs_system_expected', type: 'decimal', precision: 18, scale: 2 },
          { name: 'summary_snapshot', type: 'json' }, { name: 'master_cashier_identity', type: 'varchar', length: '150' },
          { name: 'submitted_by_user_id', type: 'bigint' }, { name: 'submitted_at', type: 'datetime' },
          { name: 'status', type: 'enum', enum: ['PENDING_VERIFICATION', 'APPROVED', 'REJECTED'] },
          { name: 'verified_counted_cash', type: 'decimal', precision: 18, scale: 2, isNullable: true },
          { name: 'verified_vs_confirmed_basis', type: 'decimal', precision: 18, scale: 2, isNullable: true },
          { name: 'verified_vs_system_expected', type: 'decimal', precision: 18, scale: 2, isNullable: true },
          { name: 'verified_by_user_id', type: 'bigint', isNullable: true }, { name: 'verified_at', type: 'datetime', isNullable: true },
          { name: 'verification_key', type: 'varchar', length: '36', isNullable: true }, { name: 'verification_fingerprint', type: 'char', length: '64', isNullable: true },
          { name: 'rejection_reason', type: 'varchar', length: '255', isNullable: true }, ...auditColumns,
        ],
        indices: [
          { name: 'uq_pos_master_reconciliation_attempt', columnNames: ['pos_register_session_id', 'attempt_number'], isUnique: true },
          { name: 'uq_pos_master_reconciliation_submission', columnNames: ['tenant_id', 'submission_key'], isUnique: true },
          { name: 'uq_pos_master_reconciliation_verification', columnNames: ['tenant_id', 'verification_key'], isUnique: true },
          { name: 'ix_pos_master_reconciliation_queue', columnNames: ['tenant_id', 'status', 'submitted_at'] },
        ],
        foreignKeys: [
          { name: 'fk_pos_master_reconciliation_tenant', columnNames: ['tenant_id'], referencedTableName: 'tbl_tenant', referencedColumnNames: ['tenant_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_master_reconciliation_location', columnNames: ['location_id'], referencedTableName: 'tbl_location', referencedColumnNames: ['location_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_master_reconciliation_register', columnNames: ['pos_register_session_id'], referencedTableName: 'tbl_pos_register_session', referencedColumnNames: ['pos_register_session_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_master_reconciliation_submitted_by', columnNames: ['submitted_by_user_id'], referencedTableName: 'tbl_user', referencedColumnNames: ['user_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_master_reconciliation_verified_by', columnNames: ['verified_by_user_id'], referencedTableName: 'tbl_user', referencedColumnNames: ['user_id'], onDelete: 'RESTRICT' },
        ],
      }));
      await queryRunner.query("ALTER TABLE tbl_pos_master_reconciliation ADD COLUMN pending_register_guard bigint GENERATED ALWAYS AS (CASE WHEN status = 'PENDING_VERIFICATION' THEN pos_register_session_id ELSE NULL END) STORED");
      await queryRunner.query('CREATE UNIQUE INDEX uq_pos_master_reconciliation_pending ON tbl_pos_master_reconciliation (tenant_id, pending_register_guard)');
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('tbl_pos_master_reconciliation')) await queryRunner.query('DROP TABLE tbl_pos_master_reconciliation');
    const payoutIndex: any[] = await queryRunner.query("SELECT index_name FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'tbl_pos_cash_movement' AND index_name = 'uq_pos_cash_movement_payout_key'");
    if (payoutIndex.length) await queryRunner.query('DROP INDEX uq_pos_cash_movement_payout_key ON tbl_pos_cash_movement');
    for (const column of ['payout_fingerprint', 'payout_key', 'physical_payer_identity', 'funding_source']) {
      if (await queryRunner.hasColumn('tbl_pos_cash_movement', column)) await queryRunner.query(`ALTER TABLE tbl_pos_cash_movement DROP COLUMN ${column}`);
    }
    await queryRunner.query('ALTER TABLE tbl_pos_cash_movement MODIFY pos_cashier_session_id bigint NOT NULL');
  }

  private async addMovementColumn(queryRunner: QueryRunner, name: string, definition: string) {
    if (!(await queryRunner.hasColumn('tbl_pos_cash_movement', name))) await queryRunner.query(`ALTER TABLE tbl_pos_cash_movement ADD COLUMN ${name} ${definition}`);
  }
}
