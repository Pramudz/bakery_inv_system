import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from 'typeorm';

const auditColumns = [
  { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
  { name: 'updated_at', type: 'datetime', isNullable: true, default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
];

export class AddPosRegisterAndCashierSessions1770000031000 implements MigrationInterface {
  name = 'AddPosRegisterAndCashierSessions1770000031000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const dependency of ['tbl_tenant', 'tbl_location', 'tbl_user', 'tbl_pos_location_config', 'tbl_pos_terminal', 'tbl_invoice', 'tbl_invoice_payment']) {
      if (!(await queryRunner.hasTable(dependency))) throw new Error(`${dependency} must exist before adding POS register sessions.`);
    }

    if (!(await queryRunner.hasTable('tbl_pos_cash_register'))) {
      await queryRunner.createTable(new Table({
        name: 'tbl_pos_cash_register',
        columns: [
          { name: 'pos_cash_register_id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'tenant_id', type: 'bigint' },
          { name: 'location_id', type: 'bigint' },
          { name: 'pos_terminal_id', type: 'bigint', isNullable: true },
          { name: 'register_mode', type: 'enum', enum: ['TERMINAL_REGISTER', 'MASTER_REGISTER'] },
          { name: 'register_key', type: 'varchar', length: '80' },
          { name: 'display_name', type: 'varchar', length: '150' },
          { name: 'is_active', type: 'tinyint', width: 1, default: 1 },
          ...auditColumns,
        ],
        indices: [
          { name: 'uq_pos_cash_register_tenant_key', columnNames: ['tenant_id', 'register_key'], isUnique: true },
          { name: 'uq_pos_cash_register_terminal', columnNames: ['pos_terminal_id'], isUnique: true },
          { name: 'ix_pos_cash_register_location', columnNames: ['tenant_id', 'location_id'] },
        ],
        foreignKeys: [
          { name: 'fk_pos_cash_register_tenant', columnNames: ['tenant_id'], referencedTableName: 'tbl_tenant', referencedColumnNames: ['tenant_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_cash_register_location', columnNames: ['location_id'], referencedTableName: 'tbl_location', referencedColumnNames: ['location_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_cash_register_terminal', columnNames: ['pos_terminal_id'], referencedTableName: 'tbl_pos_terminal', referencedColumnNames: ['pos_terminal_id'], onDelete: 'RESTRICT' },
        ],
      }));
    }

    if (!(await queryRunner.hasTable('tbl_pos_register_session'))) {
      await queryRunner.createTable(new Table({
        name: 'tbl_pos_register_session',
        columns: [
          { name: 'pos_register_session_id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'pos_cash_register_id', type: 'bigint' },
          { name: 'tenant_id', type: 'bigint' },
          { name: 'location_id', type: 'bigint' },
          { name: 'business_date', type: 'date' },
          { name: 'opening_balance', type: 'decimal', precision: 18, scale: 2 },
          { name: 'opened_by_user_id', type: 'bigint' },
          { name: 'opened_at', type: 'datetime' },
          { name: 'status', type: 'enum', enum: ['OPEN', 'CLOSED'] },
          ...auditColumns,
        ],
        indices: [{ name: 'ix_pos_register_session_location_date', columnNames: ['tenant_id', 'location_id', 'business_date'] }],
        foreignKeys: [
          { name: 'fk_pos_register_session_register', columnNames: ['pos_cash_register_id'], referencedTableName: 'tbl_pos_cash_register', referencedColumnNames: ['pos_cash_register_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_register_session_tenant', columnNames: ['tenant_id'], referencedTableName: 'tbl_tenant', referencedColumnNames: ['tenant_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_register_session_location', columnNames: ['location_id'], referencedTableName: 'tbl_location', referencedColumnNames: ['location_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_register_session_opened_by', columnNames: ['opened_by_user_id'], referencedTableName: 'tbl_user', referencedColumnNames: ['user_id'], onDelete: 'RESTRICT' },
        ],
      }));
      await queryRunner.query("ALTER TABLE tbl_pos_register_session ADD COLUMN open_register_guard bigint GENERATED ALWAYS AS (CASE WHEN status = 'OPEN' THEN pos_cash_register_id ELSE NULL END) STORED");
      await queryRunner.query('CREATE UNIQUE INDEX uq_pos_register_session_open_guard ON tbl_pos_register_session (tenant_id, open_register_guard)');
    }

    if (!(await queryRunner.hasTable('tbl_pos_cashier_session'))) {
      await queryRunner.createTable(new Table({
        name: 'tbl_pos_cashier_session',
        columns: [
          { name: 'pos_cashier_session_id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'pos_register_session_id', type: 'bigint' },
          { name: 'tenant_id', type: 'bigint' },
          { name: 'location_id', type: 'bigint' },
          { name: 'cashier_user_id', type: 'bigint' },
          { name: 'pos_terminal_id', type: 'bigint' },
          { name: 'started_at', type: 'datetime' },
          { name: 'ended_at', type: 'datetime', isNullable: true },
          { name: 'status', type: 'enum', enum: ['ACTIVE', 'ENDED'] },
          ...auditColumns,
        ],
        indices: [{ name: 'ix_pos_cashier_session_register', columnNames: ['pos_register_session_id', 'status'] }],
        foreignKeys: [
          { name: 'fk_pos_cashier_session_register_session', columnNames: ['pos_register_session_id'], referencedTableName: 'tbl_pos_register_session', referencedColumnNames: ['pos_register_session_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_cashier_session_tenant', columnNames: ['tenant_id'], referencedTableName: 'tbl_tenant', referencedColumnNames: ['tenant_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_cashier_session_location', columnNames: ['location_id'], referencedTableName: 'tbl_location', referencedColumnNames: ['location_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_cashier_session_cashier', columnNames: ['cashier_user_id'], referencedTableName: 'tbl_user', referencedColumnNames: ['user_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_cashier_session_terminal', columnNames: ['pos_terminal_id'], referencedTableName: 'tbl_pos_terminal', referencedColumnNames: ['pos_terminal_id'], onDelete: 'RESTRICT' },
        ],
      }));
      await queryRunner.query("ALTER TABLE tbl_pos_cashier_session ADD COLUMN active_cashier_guard bigint GENERATED ALWAYS AS (CASE WHEN status = 'ACTIVE' THEN cashier_user_id ELSE NULL END) STORED");
      await queryRunner.query("ALTER TABLE tbl_pos_cashier_session ADD COLUMN active_terminal_guard bigint GENERATED ALWAYS AS (CASE WHEN status = 'ACTIVE' THEN pos_terminal_id ELSE NULL END) STORED");
      await queryRunner.query('CREATE UNIQUE INDEX uq_pos_cashier_session_active_cashier ON tbl_pos_cashier_session (tenant_id, active_cashier_guard)');
      await queryRunner.query('CREATE UNIQUE INDEX uq_pos_cashier_session_active_terminal ON tbl_pos_cashier_session (tenant_id, active_terminal_guard)');
    }

    await this.addAttribution(queryRunner, 'tbl_invoice');
    await this.addAttribution(queryRunner, 'tbl_invoice_payment');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropAttribution(queryRunner, 'tbl_invoice_payment');
    await this.dropAttribution(queryRunner, 'tbl_invoice');
    for (const table of ['tbl_pos_cashier_session', 'tbl_pos_register_session', 'tbl_pos_cash_register']) {
      if (await queryRunner.hasTable(table)) await queryRunner.dropTable(table);
    }
  }

  private async addAttribution(queryRunner: QueryRunner, tableName: string) {
    const definitions = [
      { column: 'pos_terminal_id', referenceTable: 'tbl_pos_terminal', referenceColumn: 'pos_terminal_id', foreignKey: `fk_${tableName.slice(4)}_pos_terminal` },
      { column: 'pos_register_session_id', referenceTable: 'tbl_pos_register_session', referenceColumn: 'pos_register_session_id', foreignKey: `fk_${tableName.slice(4)}_pos_register_session` },
      { column: 'pos_cashier_session_id', referenceTable: 'tbl_pos_cashier_session', referenceColumn: 'pos_cashier_session_id', foreignKey: `fk_${tableName.slice(4)}_pos_cashier_session` },
    ];
    for (const definition of definitions) {
      if (!(await queryRunner.hasColumn(tableName, definition.column))) await queryRunner.addColumn(tableName, new TableColumn({ name: definition.column, type: 'bigint', isNullable: true }));
      const table = await queryRunner.getTable(tableName);
      if (!table?.foreignKeys.some((key) => key.name === definition.foreignKey)) await queryRunner.createForeignKey(tableName, new TableForeignKey({ name: definition.foreignKey, columnNames: [definition.column], referencedTableName: definition.referenceTable, referencedColumnNames: [definition.referenceColumn], onDelete: 'RESTRICT' }));
    }
  }

  private async dropAttribution(queryRunner: QueryRunner, tableName: string) {
    const table = await queryRunner.getTable(tableName);
    for (const column of ['pos_cashier_session_id', 'pos_register_session_id', 'pos_terminal_id']) {
      const foreignKey = table?.foreignKeys.find((key) => key.columnNames.includes(column));
      if (foreignKey) await queryRunner.dropForeignKey(tableName, foreignKey);
      if (await queryRunner.hasColumn(tableName, column)) await queryRunner.dropColumn(tableName, column);
    }
  }
}
