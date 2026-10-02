import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddCustomerContactFields1770000024000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [name, length] of [['mobile', '50'], ['district_or_state', '100']]) {
      if (!(await queryRunner.hasColumn('tbl_customer', name))) {
        await queryRunner.addColumn('tbl_customer', new TableColumn({ name, type: 'varchar', length, isNullable: true }));
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('tbl_customer', 'district_or_state');
    await queryRunner.dropColumn('tbl_customer', 'mobile');
  }
}
