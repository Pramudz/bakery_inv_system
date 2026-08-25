import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class ExtendTenantsAndLocations1770000002000 implements MigrationInterface {
  name = 'ExtendTenantsAndLocations1770000002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    let tenant = await queryRunner.getTable('tbl_tenant');
    if (!tenant) throw new Error('tbl_tenant does not exist');
    if (tenant.findColumnByName('tenant_code') && !tenant.findColumnByName('code')) await queryRunner.renameColumn('tbl_tenant', 'tenant_code', 'code');
    if (tenant.findColumnByName('tenant_name') && !tenant.findColumnByName('name')) await queryRunner.renameColumn('tbl_tenant', 'tenant_name', 'name');
    if (tenant.findColumnByName('tenant_is_active') && !tenant.findColumnByName('is_active')) await queryRunner.renameColumn('tbl_tenant', 'tenant_is_active', 'is_active');
    tenant = (await queryRunner.getTable('tbl_tenant'))!;
    const tenantColumns = [
      ['legal_name', 'varchar(200) NULL'], ['registration_number', 'varchar(100) NULL'],
      ['tax_registration_number', 'varchar(100) NULL'], ['email', 'varchar(150) NULL'],
      ['phone', 'varchar(50) NULL'], ['website', 'varchar(255) NULL'],
      ['address_line1', 'varchar(200) NULL'], ['address_line2', 'varchar(200) NULL'],
      ['city', 'varchar(100) NULL'], ['state_province', 'varchar(100) NULL'],
      ['postal_code', 'varchar(30) NULL'], ['country_code', 'varchar(2) NULL'],
      ['logo_url', 'varchar(500) NULL'],
    ];
    for (const [name, definition] of tenantColumns) {
      if (!tenant.findColumnByName(name)) await queryRunner.query(`ALTER TABLE tbl_tenant ADD COLUMN ${name} ${definition}`);
    }

    let location = await queryRunner.getTable('tbl_location');
    if (!location) throw new Error('tbl_location does not exist');
    const locationColumns = [
      ['contact_person', 'varchar(150) NULL'], ['email', 'varchar(150) NULL'],
      ['phone', 'varchar(50) NULL'], ['address_line1', 'varchar(200) NULL'],
      ['address_line2', 'varchar(200) NULL'], ['city', 'varchar(100) NULL'],
      ['state_province', 'varchar(100) NULL'], ['postal_code', 'varchar(30) NULL'],
      ['country_code', 'varchar(2) NULL'],
    ];
    for (const [name, definition] of locationColumns) {
      if (!location.findColumnByName(name)) await queryRunner.query(`ALTER TABLE tbl_location ADD COLUMN ${name} ${definition}`);
    }
    location = (await queryRunner.getTable('tbl_location'))!;
    if (!location.indices.some((index) => index.name === 'uq_location_tenant_code')) {
      await queryRunner.createIndex('tbl_location', new TableIndex({ name: 'uq_location_tenant_code', isUnique: true, columnNames: ['tenant_id', 'code'] }));
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const location = await queryRunner.getTable('tbl_location');
    const locationIndex = location?.indices.find((index) => index.name === 'uq_location_tenant_code');
    if (location && locationIndex) await queryRunner.dropIndex(location, locationIndex);
    for (const name of ['country_code', 'postal_code', 'state_province', 'city', 'address_line2', 'address_line1', 'phone', 'email', 'contact_person']) {
      if ((await queryRunner.getTable('tbl_location'))?.findColumnByName(name)) await queryRunner.dropColumn('tbl_location', name);
    }
    for (const name of ['logo_url', 'country_code', 'postal_code', 'state_province', 'city', 'address_line2', 'address_line1', 'website', 'phone', 'email', 'tax_registration_number', 'registration_number', 'legal_name']) {
      if ((await queryRunner.getTable('tbl_tenant'))?.findColumnByName(name)) await queryRunner.dropColumn('tbl_tenant', name);
    }
    const tenant = await queryRunner.getTable('tbl_tenant');
    if (tenant?.findColumnByName('is_active')) await queryRunner.renameColumn('tbl_tenant', 'is_active', 'tenant_is_active');
    if ((await queryRunner.getTable('tbl_tenant'))?.findColumnByName('name')) await queryRunner.renameColumn('tbl_tenant', 'name', 'tenant_name');
    if ((await queryRunner.getTable('tbl_tenant'))?.findColumnByName('code')) await queryRunner.renameColumn('tbl_tenant', 'code', 'tenant_code');
  }
}
