import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTenantTimeZone1770000019000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn('tbl_tenant', new TableColumn({
      name: 'time_zone', type: 'varchar', length: '64', isNullable: true,
    }));
    await queryRunner.query("UPDATE `tbl_tenant` SET `time_zone` = 'Asia/Colombo' WHERE `time_zone` IS NULL OR `time_zone` = ''");
    await queryRunner.changeColumn('tbl_tenant', 'time_zone', new TableColumn({
      name: 'time_zone', type: 'varchar', length: '64', isNullable: false, default: "'Asia/Colombo'",
    }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('tbl_tenant', 'time_zone');
  }
}
