import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class ScopePosTerminalCodesToLocation1770000035000 implements MigrationInterface {
  name = 'ScopePosTerminalCodesToLocation1770000035000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('tbl_pos_terminal'))) return;
    const conflicts: Array<{ tenant_id: string; location_id: string; normalized_code: string; duplicate_count: string }> = await queryRunner.query(`
      SELECT tenant_id, location_id, UPPER(TRIM(terminal_code)) AS normalized_code, COUNT(*) AS duplicate_count
      FROM tbl_pos_terminal
      GROUP BY tenant_id, location_id, UPPER(TRIM(terminal_code))
      HAVING COUNT(*) > 1
      LIMIT 1
    `);
    if (conflicts.length) {
      const row = conflicts[0];
      throw new Error(`Cannot scope POS terminal codes to location: duplicate ${row.normalized_code} exists for tenant ${row.tenant_id}, location ${row.location_id}.`);
    }
    const table = await queryRunner.getTable('tbl_pos_terminal');
    const oldIndex = table?.indices.find((index) => index.name === 'uq_pos_terminal_tenant_code');
    const newIndex = table?.indices.find((index) => index.name === 'uq_pos_terminal_location_code');
    if (oldIndex) await queryRunner.dropIndex('tbl_pos_terminal', oldIndex);
    await queryRunner.query('UPDATE tbl_pos_terminal SET terminal_code = UPPER(TRIM(terminal_code))');
    if (!newIndex) await queryRunner.createIndex('tbl_pos_terminal', new TableIndex({
      name: 'uq_pos_terminal_location_code',
      columnNames: ['tenant_id', 'location_id', 'terminal_code'],
      isUnique: true,
    }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('tbl_pos_terminal'))) return;
    const conflicts: Array<{ tenant_id: string; normalized_code: string; duplicate_count: string }> = await queryRunner.query(`
      SELECT tenant_id, UPPER(TRIM(terminal_code)) AS normalized_code, COUNT(*) AS duplicate_count
      FROM tbl_pos_terminal
      GROUP BY tenant_id, UPPER(TRIM(terminal_code))
      HAVING COUNT(*) > 1
      LIMIT 1
    `);
    if (conflicts.length) {
      const row = conflicts[0];
      throw new Error(`Cannot restore tenant-wide POS terminal codes: duplicate ${row.normalized_code} exists for tenant ${row.tenant_id}.`);
    }
    const table = await queryRunner.getTable('tbl_pos_terminal');
    const scoped = table?.indices.find((index) => index.name === 'uq_pos_terminal_location_code');
    const legacy = table?.indices.find((index) => index.name === 'uq_pos_terminal_tenant_code');
    if (scoped) await queryRunner.dropIndex('tbl_pos_terminal', scoped);
    if (!legacy) await queryRunner.createIndex('tbl_pos_terminal', new TableIndex({
      name: 'uq_pos_terminal_tenant_code',
      columnNames: ['tenant_id', 'terminal_code'],
      isUnique: true,
    }));
  }
}
