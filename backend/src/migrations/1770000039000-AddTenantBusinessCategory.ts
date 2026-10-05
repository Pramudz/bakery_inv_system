import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantBusinessCategory1770000039000 implements MigrationInterface {
  name = 'AddTenantBusinessCategory1770000039000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const tenant = await queryRunner.getTable('tbl_tenant');
    if (!tenant) throw new Error('tbl_tenant does not exist');
    if (!tenant.findColumnByName('business_category')) {
      await queryRunner.query(
        'ALTER TABLE tbl_tenant ADD COLUMN business_category varchar(150) NULL',
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const tenant = await queryRunner.getTable('tbl_tenant');
    if (tenant?.findColumnByName('business_category')) {
      await queryRunner.dropColumn('tbl_tenant', 'business_category');
    }
  }
}
