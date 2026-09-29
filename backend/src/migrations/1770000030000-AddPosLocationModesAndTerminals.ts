import { MigrationInterface, QueryRunner, Table } from 'typeorm';

const auditColumns = [
  { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
  { name: 'updated_at', type: 'datetime', isNullable: true, default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
];

export class AddPosLocationModesAndTerminals1770000030000 implements MigrationInterface {
  name = 'AddPosLocationModesAndTerminals1770000030000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const dependency of ['tbl_tenant', 'tbl_location', 'tbl_user']) {
      if (!(await queryRunner.hasTable(dependency))) throw new Error(`${dependency} must exist before adding POS registers.`);
    }

    if (!(await queryRunner.hasTable('tbl_pos_location_config'))) {
      await queryRunner.createTable(new Table({
        name: 'tbl_pos_location_config',
        columns: [
          { name: 'pos_location_config_id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'tenant_id', type: 'bigint' },
          { name: 'location_id', type: 'bigint' },
          { name: 'register_mode', type: 'enum', enum: ['TERMINAL_REGISTER', 'MASTER_REGISTER'] },
          ...auditColumns,
        ],
        indices: [
          { name: 'uq_pos_location_config_location', columnNames: ['location_id'], isUnique: true },
          { name: 'ix_pos_location_config_tenant', columnNames: ['tenant_id'] },
        ],
        foreignKeys: [
          { name: 'fk_pos_location_config_tenant', columnNames: ['tenant_id'], referencedTableName: 'tbl_tenant', referencedColumnNames: ['tenant_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_location_config_location', columnNames: ['location_id'], referencedTableName: 'tbl_location', referencedColumnNames: ['location_id'], onDelete: 'RESTRICT' },
        ],
      }));
    }

    if (!(await queryRunner.hasTable('tbl_pos_terminal'))) {
      await queryRunner.createTable(new Table({
        name: 'tbl_pos_terminal',
        columns: [
          { name: 'pos_terminal_id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'tenant_id', type: 'bigint' },
          { name: 'location_id', type: 'bigint' },
          { name: 'terminal_code', type: 'varchar', length: '50' },
          { name: 'display_name', type: 'varchar', length: '150' },
          { name: 'is_active', type: 'tinyint', width: 1, default: 1 },
          ...auditColumns,
        ],
        indices: [
          { name: 'uq_pos_terminal_tenant_code', columnNames: ['tenant_id', 'terminal_code'], isUnique: true },
          { name: 'ix_pos_terminal_tenant_location', columnNames: ['tenant_id', 'location_id'] },
        ],
        foreignKeys: [
          { name: 'fk_pos_terminal_tenant', columnNames: ['tenant_id'], referencedTableName: 'tbl_tenant', referencedColumnNames: ['tenant_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_terminal_location', columnNames: ['location_id'], referencedTableName: 'tbl_location', referencedColumnNames: ['location_id'], onDelete: 'RESTRICT' },
        ],
      }));
    }

    if (!(await queryRunner.hasTable('tbl_pos_terminal_activation'))) {
      await queryRunner.createTable(new Table({
        name: 'tbl_pos_terminal_activation',
        columns: [
          { name: 'pos_terminal_activation_id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'tenant_id', type: 'bigint' },
          { name: 'pos_terminal_id', type: 'bigint' },
          { name: 'activation_secret_hash', type: 'char', length: '64' },
          { name: 'expires_at', type: 'datetime' },
          { name: 'consumed_at', type: 'datetime', isNullable: true },
          { name: 'consumed_by_user_id', type: 'bigint', isNullable: true },
          { name: 'issued_by_user_id', type: 'bigint' },
          { name: 'revoked_at', type: 'datetime', isNullable: true },
          { name: 'revoked_by_user_id', type: 'bigint', isNullable: true },
          ...auditColumns,
        ],
        indices: [
          { name: 'uq_pos_terminal_activation_hash', columnNames: ['activation_secret_hash'], isUnique: true },
          { name: 'ix_pos_terminal_activation_terminal', columnNames: ['pos_terminal_id', 'expires_at'] },
        ],
        foreignKeys: [
          { name: 'fk_pos_terminal_activation_tenant', columnNames: ['tenant_id'], referencedTableName: 'tbl_tenant', referencedColumnNames: ['tenant_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_terminal_activation_terminal', columnNames: ['pos_terminal_id'], referencedTableName: 'tbl_pos_terminal', referencedColumnNames: ['pos_terminal_id'], onDelete: 'CASCADE' },
          { name: 'fk_pos_terminal_activation_consumed_by', columnNames: ['consumed_by_user_id'], referencedTableName: 'tbl_user', referencedColumnNames: ['user_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_terminal_activation_issued_by', columnNames: ['issued_by_user_id'], referencedTableName: 'tbl_user', referencedColumnNames: ['user_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_terminal_activation_revoked_by', columnNames: ['revoked_by_user_id'], referencedTableName: 'tbl_user', referencedColumnNames: ['user_id'], onDelete: 'RESTRICT' },
        ],
      }));
    }

    if (!(await queryRunner.hasTable('tbl_pos_terminal_pairing'))) {
      await queryRunner.createTable(new Table({
        name: 'tbl_pos_terminal_pairing',
        columns: [
          { name: 'pos_terminal_pairing_id', type: 'bigint', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'tenant_id', type: 'bigint' },
          { name: 'pos_terminal_id', type: 'bigint' },
          { name: 'pairing_secret_hash', type: 'char', length: '64' },
          { name: 'paired_at', type: 'datetime' },
          { name: 'paired_by_user_id', type: 'bigint' },
          { name: 'last_seen_at', type: 'datetime', isNullable: true },
          { name: 'revoked_at', type: 'datetime', isNullable: true },
          { name: 'revoked_by_user_id', type: 'bigint', isNullable: true },
          { name: 'revocation_reason', type: 'varchar', length: '255', isNullable: true },
          ...auditColumns,
        ],
        indices: [
          { name: 'uq_pos_terminal_pairing_hash', columnNames: ['pairing_secret_hash'], isUnique: true },
          { name: 'ix_pos_terminal_pairing_terminal', columnNames: ['pos_terminal_id', 'revoked_at'] },
        ],
        foreignKeys: [
          { name: 'fk_pos_terminal_pairing_tenant', columnNames: ['tenant_id'], referencedTableName: 'tbl_tenant', referencedColumnNames: ['tenant_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_terminal_pairing_terminal', columnNames: ['pos_terminal_id'], referencedTableName: 'tbl_pos_terminal', referencedColumnNames: ['pos_terminal_id'], onDelete: 'CASCADE' },
          { name: 'fk_pos_terminal_pairing_paired_by', columnNames: ['paired_by_user_id'], referencedTableName: 'tbl_user', referencedColumnNames: ['user_id'], onDelete: 'RESTRICT' },
          { name: 'fk_pos_terminal_pairing_revoked_by', columnNames: ['revoked_by_user_id'], referencedTableName: 'tbl_user', referencedColumnNames: ['user_id'], onDelete: 'RESTRICT' },
        ],
      }));
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['tbl_pos_terminal_pairing', 'tbl_pos_terminal_activation', 'tbl_pos_terminal', 'tbl_pos_location_config']) {
      if (await queryRunner.hasTable(table)) await queryRunner.dropTable(table);
    }
  }
}
