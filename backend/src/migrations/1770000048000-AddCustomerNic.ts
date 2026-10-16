import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddCustomerNic1770000048000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasColumn('tbl_customer', 'nic'))) {
      await runner.addColumn('tbl_customer', new TableColumn({ name: 'nic', type: 'varchar', length: '20', isNullable: true }));
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    if (await runner.hasColumn('tbl_customer', 'nic')) await runner.dropColumn('tbl_customer', 'nic');
  }
}
