import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from 'typeorm';

export class AddPaymentTypesAndCardChannels1770000028000 implements MigrationInterface {
  name = 'AddPaymentTypesAndCardChannels1770000028000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['tbl_payment_method', 'tbl_invoice_payment', 'tbl_invoice_refund_payment', 'tbl_tenant']) {
      if (!(await queryRunner.hasTable(table))) throw new Error(`${table} must exist before adding payment types and card channels.`);
    }
    if (!(await queryRunner.hasColumn('tbl_payment_method', 'payment_method_type'))) {
      await queryRunner.addColumn('tbl_payment_method', new TableColumn({ name: 'payment_method_type', type: 'enum', enum: ['CASH', 'CARD', 'CHEQUE'], isNullable: true }));
    }

    // Deliberately narrow: “Credit” is not classified because it may mean card or customer debt.
    await queryRunner.query(`UPDATE tbl_payment_method SET payment_method_type = 'CASH' WHERE payment_method_type IS NULL AND UPPER(TRIM(payment_method_name)) = 'CASH'`);
    await queryRunner.query(`UPDATE tbl_payment_method SET payment_method_type = 'CARD' WHERE payment_method_type IS NULL AND UPPER(TRIM(payment_method_name)) IN ('CARD', 'CREDIT CARD', 'DEBIT CARD', 'CREDIT/DEBIT CARD', 'DEBIT/CREDIT CARD')`);
    await queryRunner.query(`UPDATE tbl_payment_method SET payment_method_type = 'CHEQUE' WHERE payment_method_type IS NULL AND UPPER(TRIM(payment_method_name)) IN ('CHEQUE', 'CHECK')`);

    if (!(await queryRunner.hasTable('tbl_payment_channel'))) {
      await queryRunner.createTable(new Table({
        name: 'tbl_payment_channel',
        columns: [
          { name: 'payment_channel_id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'tenant_id', type: 'bigint' },
          { name: 'code', type: 'varchar', length: '50' },
          { name: 'name', type: 'varchar', length: '150' },
          { name: 'is_active', type: 'tinyint', width: 1, default: 1 },
          { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'datetime', isNullable: true, default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
        ],
        indices: [
          { name: 'uq_payment_channel_tenant_code', columnNames: ['tenant_id', 'code'], isUnique: true },
          { name: 'ix_payment_channel_tenant_active', columnNames: ['tenant_id', 'is_active'] },
        ],
        foreignKeys: [
          { name: 'fk_payment_channel_tenant', columnNames: ['tenant_id'], referencedTableName: 'tbl_tenant', referencedColumnNames: ['tenant_id'], onDelete: 'RESTRICT' },
        ],
      }));
    }

    await this.addPaymentSnapshotColumns(queryRunner, 'tbl_invoice_payment', 'fk_invoice_payment_channel');
    await this.addPaymentSnapshotColumns(queryRunner, 'tbl_invoice_refund_payment', 'fk_invoice_refund_payment_channel');
    await queryRunner.query(`UPDATE tbl_invoice_payment ip INNER JOIN tbl_payment_method pm ON pm.payment_method_id = ip.payment_method_id SET ip.payment_method_type_snapshot = pm.payment_method_type WHERE ip.payment_method_type_snapshot IS NULL AND pm.payment_method_type IS NOT NULL`);
    await queryRunner.query(`UPDATE tbl_invoice_refund_payment rp INNER JOIN tbl_payment_method pm ON pm.payment_method_id = rp.payment_method_id SET rp.payment_method_type_snapshot = pm.payment_method_type WHERE rp.payment_method_type_snapshot IS NULL AND pm.payment_method_type IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropPaymentSnapshotColumns(queryRunner, 'tbl_invoice_refund_payment', 'fk_invoice_refund_payment_channel');
    await this.dropPaymentSnapshotColumns(queryRunner, 'tbl_invoice_payment', 'fk_invoice_payment_channel');
    if (await queryRunner.hasTable('tbl_payment_channel')) await queryRunner.dropTable('tbl_payment_channel');
    if (await queryRunner.hasColumn('tbl_payment_method', 'payment_method_type')) await queryRunner.dropColumn('tbl_payment_method', 'payment_method_type');
  }

  private async addPaymentSnapshotColumns(queryRunner: QueryRunner, tableName: string, foreignKeyName: string) {
    const columns = [
      new TableColumn({ name: 'payment_method_type_snapshot', type: 'enum', enum: ['CASH', 'CARD', 'CHEQUE'], isNullable: true }),
      new TableColumn({ name: 'payment_channel_id', type: 'bigint', isNullable: true }),
      new TableColumn({ name: 'payment_channel_code_snapshot', type: 'varchar', length: '50', isNullable: true }),
      new TableColumn({ name: 'payment_channel_name_snapshot', type: 'varchar', length: '150', isNullable: true }),
    ];
    for (const column of columns) if (!(await queryRunner.hasColumn(tableName, column.name))) await queryRunner.addColumn(tableName, column);
    const table = await queryRunner.getTable(tableName);
    if (!table?.foreignKeys.some((key) => key.name === foreignKeyName)) {
      await queryRunner.createForeignKey(tableName, new TableForeignKey({ name: foreignKeyName, columnNames: ['payment_channel_id'], referencedTableName: 'tbl_payment_channel', referencedColumnNames: ['payment_channel_id'], onDelete: 'RESTRICT' }));
    }
  }

  private async dropPaymentSnapshotColumns(queryRunner: QueryRunner, tableName: string, foreignKeyName: string) {
    const table = await queryRunner.getTable(tableName);
    const foreignKey = table?.foreignKeys.find((key) => key.name === foreignKeyName);
    if (foreignKey) await queryRunner.dropForeignKey(tableName, foreignKey);
    for (const column of ['payment_channel_name_snapshot', 'payment_channel_code_snapshot', 'payment_channel_id', 'payment_method_type_snapshot']) {
      if (await queryRunner.hasColumn(tableName, column)) await queryRunner.dropColumn(tableName, column);
    }
  }
}
