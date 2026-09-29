import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

const auditColumns = [
  { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
  { name: 'updated_at', type: 'datetime', isNullable: true, default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
];

export class AddTerminalRegisterClosing1770000032000 implements MigrationInterface {
  name = 'AddTerminalRegisterClosing1770000032000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['tbl_pos_register_session', 'tbl_pos_cashier_session', 'tbl_invoice', 'tbl_invoice_payment', 'tbl_invoice_refund', 'tbl_invoice_refund_payment', 'tbl_invoice_payment_reversal']) {
      if (!(await queryRunner.hasTable(table))) throw new Error(`${table} must exist before adding terminal register closing.`);
    }

    await queryRunner.query('DROP INDEX uq_pos_register_session_open_guard ON tbl_pos_register_session');
    await queryRunner.query('ALTER TABLE tbl_pos_register_session DROP COLUMN open_register_guard');
    await queryRunner.query("ALTER TABLE tbl_pos_register_session MODIFY status enum('OPEN','PENDING_VERIFICATION','RECOUNT_REQUIRED','CLOSED') NOT NULL");
    await this.addColumn(queryRunner, 'tbl_pos_register_session', new TableColumn({ name: 'closed_at', type: 'datetime', isNullable: true }));
    await this.addColumn(queryRunner, 'tbl_pos_register_session', new TableColumn({ name: 'closed_by_user_id', type: 'bigint', isNullable: true }));
    await this.addForeignKey(queryRunner, 'tbl_pos_register_session', new TableForeignKey({ name: 'fk_pos_register_session_closed_by', columnNames: ['closed_by_user_id'], referencedTableName: 'tbl_user', referencedColumnNames: ['user_id'], onDelete: 'RESTRICT' }));
    await queryRunner.query("ALTER TABLE tbl_pos_register_session ADD COLUMN open_register_guard bigint GENERATED ALWAYS AS (CASE WHEN status IN ('OPEN','PENDING_VERIFICATION','RECOUNT_REQUIRED') THEN pos_cash_register_id ELSE NULL END) STORED");
    await queryRunner.query('CREATE UNIQUE INDEX uq_pos_register_session_open_guard ON tbl_pos_register_session (tenant_id, open_register_guard)');

    await queryRunner.query('CREATE INDEX ix_pos_cashier_session_cashier_user ON tbl_pos_cashier_session (cashier_user_id)');
    await queryRunner.query('CREATE INDEX ix_pos_cashier_session_terminal ON tbl_pos_cashier_session (pos_terminal_id)');
    await queryRunner.query('CREATE INDEX ix_pos_cashier_session_tenant ON tbl_pos_cashier_session (tenant_id)');
    await queryRunner.query('DROP INDEX uq_pos_cashier_session_active_cashier ON tbl_pos_cashier_session');
    await queryRunner.query('DROP INDEX uq_pos_cashier_session_active_terminal ON tbl_pos_cashier_session');
    await queryRunner.query('ALTER TABLE tbl_pos_cashier_session DROP COLUMN active_cashier_guard');
    await queryRunner.query('ALTER TABLE tbl_pos_cashier_session DROP COLUMN active_terminal_guard');
    await queryRunner.query("ALTER TABLE tbl_pos_cashier_session MODIFY status enum('ACTIVE','PENDING_VERIFICATION','RECOUNT_REQUIRED','ENDED') NOT NULL");
    await this.addColumn(queryRunner, 'tbl_pos_cashier_session', new TableColumn({ name: 'ended_by_user_id', type: 'bigint', isNullable: true }));
    await this.addForeignKey(queryRunner, 'tbl_pos_cashier_session', new TableForeignKey({ name: 'fk_pos_cashier_session_ended_by', columnNames: ['ended_by_user_id'], referencedTableName: 'tbl_user', referencedColumnNames: ['user_id'], onDelete: 'RESTRICT' }));
    await queryRunner.query("ALTER TABLE tbl_pos_cashier_session ADD COLUMN active_cashier_guard bigint GENERATED ALWAYS AS (CASE WHEN status IN ('ACTIVE','PENDING_VERIFICATION','RECOUNT_REQUIRED') THEN cashier_user_id ELSE NULL END) STORED");
    await queryRunner.query("ALTER TABLE tbl_pos_cashier_session ADD COLUMN active_terminal_guard bigint GENERATED ALWAYS AS (CASE WHEN status IN ('ACTIVE','PENDING_VERIFICATION','RECOUNT_REQUIRED') THEN pos_terminal_id ELSE NULL END) STORED");
    await queryRunner.query('CREATE UNIQUE INDEX uq_pos_cashier_session_active_cashier ON tbl_pos_cashier_session (tenant_id, active_cashier_guard)');
    await queryRunner.query('CREATE UNIQUE INDEX uq_pos_cashier_session_active_terminal ON tbl_pos_cashier_session (tenant_id, active_terminal_guard)');

    if (!(await queryRunner.hasTable('tbl_pos_cash_movement'))) {
      await queryRunner.createTable(new Table({
        name: 'tbl_pos_cash_movement',
        columns: [
          { name: 'pos_cash_movement_id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'tenant_id', type: 'bigint' }, { name: 'location_id', type: 'bigint' },
          { name: 'pos_register_session_id', type: 'bigint' }, { name: 'pos_cashier_session_id', type: 'bigint' },
          { name: 'movement_type', type: 'enum', enum: ['REFUND_PAYOUT', 'PAYMENT_REVERSAL_PAYOUT'] },
          { name: 'direction', type: 'enum', enum: ['IN', 'OUT'] },
          { name: 'amount', type: 'decimal', precision: 18, scale: 2 },
          { name: 'source_type', type: 'varchar', length: '40' }, { name: 'source_id', type: 'bigint' },
          { name: 'reason', type: 'varchar', length: '255' }, { name: 'occurred_at', type: 'datetime' },
          { name: 'created_by_user_id', type: 'bigint' }, ...auditColumns,
        ],
        indices: [
          { name: 'uq_pos_cash_movement_source', columnNames: ['tenant_id', 'source_type', 'source_id'], isUnique: true },
          { name: 'ix_pos_cash_movement_register', columnNames: ['pos_register_session_id', 'occurred_at'] },
        ],
        foreignKeys: [
          { name: 'fk_pos_cash_movement_tenant', columnNames: ['tenant_id'], referencedTableName: 'tbl_tenant', referencedColumnNames: ['tenant_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_cash_movement_location', columnNames: ['location_id'], referencedTableName: 'tbl_location', referencedColumnNames: ['location_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_cash_movement_register_session', columnNames: ['pos_register_session_id'], referencedTableName: 'tbl_pos_register_session', referencedColumnNames: ['pos_register_session_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_cash_movement_cashier_session', columnNames: ['pos_cashier_session_id'], referencedTableName: 'tbl_pos_cashier_session', referencedColumnNames: ['pos_cashier_session_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_cash_movement_created_by', columnNames: ['created_by_user_id'], referencedTableName: 'tbl_user', referencedColumnNames: ['user_id'], onDelete: 'RESTRICT' },
        ],
      }));
    }

    if (!(await queryRunner.hasTable('tbl_pos_cash_reconciliation'))) {
      await queryRunner.createTable(new Table({
        name: 'tbl_pos_cash_reconciliation',
        columns: [
          { name: 'pos_cash_reconciliation_id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'tenant_id', type: 'bigint' }, { name: 'location_id', type: 'bigint' },
          { name: 'pos_register_session_id', type: 'bigint' }, { name: 'pos_cashier_session_id', type: 'bigint' },
          { name: 'attempt_number', type: 'int' }, { name: 'submission_key', type: 'varchar', length: '36' },
          { name: 'opening_balance', type: 'decimal', precision: 18, scale: 2 },
          { name: 'cash_received', type: 'decimal', precision: 18, scale: 2 },
          { name: 'cash_paid_out', type: 'decimal', precision: 18, scale: 2 },
          { name: 'expected_cash', type: 'decimal', precision: 18, scale: 2 },
          { name: 'counted_cash', type: 'decimal', precision: 18, scale: 2 },
          { name: 'cashier_variance', type: 'decimal', precision: 18, scale: 2 },
          { name: 'summary_snapshot', type: 'json' },
          { name: 'submitted_by_user_id', type: 'bigint' }, { name: 'submitted_at', type: 'datetime' },
          { name: 'status', type: 'enum', enum: ['PENDING_VERIFICATION', 'APPROVED', 'REJECTED'] },
          { name: 'verified_counted_cash', type: 'decimal', precision: 18, scale: 2, isNullable: true },
          { name: 'verified_variance', type: 'decimal', precision: 18, scale: 2, isNullable: true },
          { name: 'verified_by_user_id', type: 'bigint', isNullable: true }, { name: 'verified_at', type: 'datetime', isNullable: true },
          { name: 'verification_key', type: 'varchar', length: '36', isNullable: true },
          { name: 'rejection_reason', type: 'varchar', length: '255', isNullable: true }, ...auditColumns,
        ],
        indices: [
          { name: 'uq_pos_reconciliation_attempt', columnNames: ['pos_cashier_session_id', 'attempt_number'], isUnique: true },
          { name: 'uq_pos_reconciliation_submission', columnNames: ['tenant_id', 'submission_key'], isUnique: true },
          { name: 'uq_pos_reconciliation_verification', columnNames: ['tenant_id', 'verification_key'], isUnique: true },
          { name: 'ix_pos_reconciliation_queue', columnNames: ['tenant_id', 'status', 'submitted_at'] },
        ],
        foreignKeys: [
          { name: 'fk_pos_reconciliation_tenant', columnNames: ['tenant_id'], referencedTableName: 'tbl_tenant', referencedColumnNames: ['tenant_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_reconciliation_location', columnNames: ['location_id'], referencedTableName: 'tbl_location', referencedColumnNames: ['location_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_reconciliation_register_session', columnNames: ['pos_register_session_id'], referencedTableName: 'tbl_pos_register_session', referencedColumnNames: ['pos_register_session_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_reconciliation_cashier_session', columnNames: ['pos_cashier_session_id'], referencedTableName: 'tbl_pos_cashier_session', referencedColumnNames: ['pos_cashier_session_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_reconciliation_submitted_by', columnNames: ['submitted_by_user_id'], referencedTableName: 'tbl_user', referencedColumnNames: ['user_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_reconciliation_verified_by', columnNames: ['verified_by_user_id'], referencedTableName: 'tbl_user', referencedColumnNames: ['user_id'], onDelete: 'RESTRICT' },
        ],
      }));
      await queryRunner.query("ALTER TABLE tbl_pos_cash_reconciliation ADD COLUMN pending_cashier_guard bigint GENERATED ALWAYS AS (CASE WHEN status = 'PENDING_VERIFICATION' THEN pos_cashier_session_id ELSE NULL END) STORED");
      await queryRunner.query('CREATE UNIQUE INDEX uq_pos_reconciliation_pending ON tbl_pos_cash_reconciliation (tenant_id, pending_cashier_guard)');
    }

    await this.addColumn(queryRunner, 'tbl_invoice_refund', new TableColumn({ name: 'refund_key', type: 'varchar', length: '36', isNullable: true }));
    await this.addColumn(queryRunner, 'tbl_invoice_refund', new TableColumn({ name: 'refund_fingerprint', type: 'char', length: '64', isNullable: true }));
    await this.addIndex(queryRunner, 'tbl_invoice_refund', new TableIndex({ name: 'uq_invoice_refund_tenant_key', columnNames: ['tenant_id', 'refund_key'], isUnique: true }));
    await this.addAttribution(queryRunner, 'tbl_invoice_refund');
    await this.addAttribution(queryRunner, 'tbl_invoice_refund_payment');
    await this.addColumn(queryRunner, 'tbl_invoice_payment_reversal', new TableColumn({ name: 'reversal_key', type: 'varchar', length: '36', isNullable: true }));
    await this.addColumn(queryRunner, 'tbl_invoice_payment_reversal', new TableColumn({ name: 'reversal_fingerprint', type: 'char', length: '64', isNullable: true }));
    await this.addIndex(queryRunner, 'tbl_invoice_payment_reversal', new TableIndex({ name: 'uq_invoice_payment_reversal_key', columnNames: ['reversal_key'], isUnique: true }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropIndex(queryRunner, 'tbl_invoice_payment_reversal', 'uq_invoice_payment_reversal_key');
    if (await queryRunner.hasColumn('tbl_invoice_payment_reversal', 'reversal_fingerprint')) await queryRunner.dropColumn('tbl_invoice_payment_reversal', 'reversal_fingerprint');
    if (await queryRunner.hasColumn('tbl_invoice_payment_reversal', 'reversal_key')) await queryRunner.dropColumn('tbl_invoice_payment_reversal', 'reversal_key');
    await this.dropAttribution(queryRunner, 'tbl_invoice_refund_payment');
    await this.dropAttribution(queryRunner, 'tbl_invoice_refund');
    await this.dropIndex(queryRunner, 'tbl_invoice_refund', 'uq_invoice_refund_tenant_key');
    if (await queryRunner.hasColumn('tbl_invoice_refund', 'refund_fingerprint')) await queryRunner.dropColumn('tbl_invoice_refund', 'refund_fingerprint');
    if (await queryRunner.hasColumn('tbl_invoice_refund', 'refund_key')) await queryRunner.dropColumn('tbl_invoice_refund', 'refund_key');
    if (await queryRunner.hasTable('tbl_pos_cash_reconciliation')) await queryRunner.dropTable('tbl_pos_cash_reconciliation');
    if (await queryRunner.hasTable('tbl_pos_cash_movement')) await queryRunner.dropTable('tbl_pos_cash_movement');

    await queryRunner.query('DROP INDEX uq_pos_cashier_session_active_cashier ON tbl_pos_cashier_session');
    await queryRunner.query('DROP INDEX uq_pos_cashier_session_active_terminal ON tbl_pos_cashier_session');
    await queryRunner.query('ALTER TABLE tbl_pos_cashier_session DROP COLUMN active_cashier_guard');
    await queryRunner.query('ALTER TABLE tbl_pos_cashier_session DROP COLUMN active_terminal_guard');
    const cashierTable = await queryRunner.getTable('tbl_pos_cashier_session');
    const endedBy = cashierTable?.foreignKeys.find((key) => key.name === 'fk_pos_cashier_session_ended_by');
    if (endedBy) await queryRunner.dropForeignKey('tbl_pos_cashier_session', endedBy);
    if (await queryRunner.hasColumn('tbl_pos_cashier_session', 'ended_by_user_id')) await queryRunner.dropColumn('tbl_pos_cashier_session', 'ended_by_user_id');
    await queryRunner.query("ALTER TABLE tbl_pos_cashier_session MODIFY status enum('ACTIVE','ENDED') NOT NULL");
    await queryRunner.query("ALTER TABLE tbl_pos_cashier_session ADD COLUMN active_cashier_guard bigint GENERATED ALWAYS AS (CASE WHEN status = 'ACTIVE' THEN cashier_user_id ELSE NULL END) STORED");
    await queryRunner.query("ALTER TABLE tbl_pos_cashier_session ADD COLUMN active_terminal_guard bigint GENERATED ALWAYS AS (CASE WHEN status = 'ACTIVE' THEN pos_terminal_id ELSE NULL END) STORED");
    await queryRunner.query('CREATE UNIQUE INDEX uq_pos_cashier_session_active_cashier ON tbl_pos_cashier_session (tenant_id, active_cashier_guard)');
    await queryRunner.query('CREATE UNIQUE INDEX uq_pos_cashier_session_active_terminal ON tbl_pos_cashier_session (tenant_id, active_terminal_guard)');

    await queryRunner.query('DROP INDEX uq_pos_register_session_open_guard ON tbl_pos_register_session');
    await queryRunner.query('ALTER TABLE tbl_pos_register_session DROP COLUMN open_register_guard');
    const registerTable = await queryRunner.getTable('tbl_pos_register_session');
    const closedBy = registerTable?.foreignKeys.find((key) => key.name === 'fk_pos_register_session_closed_by');
    if (closedBy) await queryRunner.dropForeignKey('tbl_pos_register_session', closedBy);
    if (await queryRunner.hasColumn('tbl_pos_register_session', 'closed_by_user_id')) await queryRunner.dropColumn('tbl_pos_register_session', 'closed_by_user_id');
    if (await queryRunner.hasColumn('tbl_pos_register_session', 'closed_at')) await queryRunner.dropColumn('tbl_pos_register_session', 'closed_at');
    await queryRunner.query("ALTER TABLE tbl_pos_register_session MODIFY status enum('OPEN','CLOSED') NOT NULL");
    await queryRunner.query("ALTER TABLE tbl_pos_register_session ADD COLUMN open_register_guard bigint GENERATED ALWAYS AS (CASE WHEN status = 'OPEN' THEN pos_cash_register_id ELSE NULL END) STORED");
    await queryRunner.query('CREATE UNIQUE INDEX uq_pos_register_session_open_guard ON tbl_pos_register_session (tenant_id, open_register_guard)');
  }

  private async addAttribution(queryRunner: QueryRunner, tableName: string) {
    const definitions = [
      ['pos_terminal_id', 'tbl_pos_terminal', 'pos_terminal_id'],
      ['pos_register_session_id', 'tbl_pos_register_session', 'pos_register_session_id'],
      ['pos_cashier_session_id', 'tbl_pos_cashier_session', 'pos_cashier_session_id'],
    ];
    for (const [column, referencedTableName, referencedColumn] of definitions) {
      await this.addColumn(queryRunner, tableName, new TableColumn({ name: column, type: 'bigint', isNullable: true }));
      await this.addForeignKey(queryRunner, tableName, new TableForeignKey({ name: `fk_${tableName.slice(4)}_${column.replace('_id', '')}`, columnNames: [column], referencedTableName, referencedColumnNames: [referencedColumn], onDelete: 'RESTRICT' }));
    }
  }

  private async dropAttribution(queryRunner: QueryRunner, tableName: string) {
    let table = await queryRunner.getTable(tableName);
    for (const column of ['pos_cashier_session_id', 'pos_register_session_id', 'pos_terminal_id']) {
      const foreignKey = table?.foreignKeys.find((key) => key.columnNames.includes(column));
      if (foreignKey) await queryRunner.dropForeignKey(tableName, foreignKey);
      if (await queryRunner.hasColumn(tableName, column)) await queryRunner.dropColumn(tableName, column);
      table = await queryRunner.getTable(tableName);
    }
  }

  private async addColumn(queryRunner: QueryRunner, tableName: string, column: TableColumn) {
    if (!(await queryRunner.hasColumn(tableName, column.name))) await queryRunner.addColumn(tableName, column);
  }

  private async addForeignKey(queryRunner: QueryRunner, tableName: string, key: TableForeignKey) {
    const table = await queryRunner.getTable(tableName);
    if (!table?.foreignKeys.some((existing) => existing.name === key.name)) await queryRunner.createForeignKey(tableName, key);
  }

  private async addIndex(queryRunner: QueryRunner, tableName: string, index: TableIndex) {
    const table = await queryRunner.getTable(tableName);
    if (!table?.indices.some((existing) => existing.name === index.name)) await queryRunner.createIndex(tableName, index);
  }

  private async dropIndex(queryRunner: QueryRunner, tableName: string, name: string) {
    const table = await queryRunner.getTable(tableName);
    const index = table?.indices.find((existing) => existing.name === name);
    if (index) await queryRunner.dropIndex(tableName, index);
  }
}
