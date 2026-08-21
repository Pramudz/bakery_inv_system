import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class EnhanceSupplierMasterData1770000003000 implements MigrationInterface {
  name = 'EnhanceSupplierMasterData1770000003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const duplicateCodes = await queryRunner.query(`
      SELECT tenant_id, supplier_code, COUNT(*) AS duplicate_count
      FROM tbl_supplier
      GROUP BY tenant_id, supplier_code
      HAVING COUNT(*) > 1
      LIMIT 1
    `);
    if (duplicateCodes.length) throw new Error(`Cannot add supplier code uniqueness: duplicate code ${duplicateCodes[0].supplier_code} exists for tenant ${duplicateCodes[0].tenant_id}.`);

    const supplier = await queryRunner.getTable('tbl_supplier');
    if (!supplier) throw new Error('tbl_supplier does not exist');
    if (!supplier.indices.some((index) => index.name === 'uq_supplier_tenant_code')) {
      await queryRunner.createIndex('tbl_supplier', new TableIndex({ name: 'uq_supplier_tenant_code', isUnique: true, columnNames: ['tenant_id', 'supplier_code'] }));
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tbl_supplier_address (
        supplier_address_id bigint NOT NULL AUTO_INCREMENT,
        tenant_id bigint NOT NULL,
        supplier_id bigint NOT NULL,
        address_type varchar(20) NOT NULL,
        address_line1 varchar(255) NOT NULL,
        address_line2 varchar(255) NULL,
        city varchar(100) NULL,
        district_or_state varchar(100) NULL,
        postal_code varchar(30) NULL,
        country_code varchar(2) NULL,
        is_primary tinyint NOT NULL DEFAULT 0,
        is_active tinyint NOT NULL DEFAULT 1,
        active_primary_supplier_id bigint GENERATED ALWAYS AS (
          CASE WHEN is_primary = 1 AND is_active = 1 THEN supplier_id ELSE NULL END
        ) STORED,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (supplier_address_id),
        INDEX idx_supplier_address_tenant_supplier (tenant_id, supplier_id),
        UNIQUE INDEX uq_supplier_address_active_primary (active_primary_supplier_id),
        CONSTRAINT fk_supplier_address_tenant FOREIGN KEY (tenant_id) REFERENCES tbl_tenant (tenant_id) ON DELETE RESTRICT,
        CONSTRAINT fk_supplier_address_supplier FOREIGN KEY (supplier_id) REFERENCES tbl_supplier (supplier_id) ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tbl_supplier_contact (
        supplier_contact_id bigint NOT NULL AUTO_INCREMENT,
        tenant_id bigint NOT NULL,
        supplier_id bigint NOT NULL,
        contact_name varchar(150) NOT NULL,
        designation varchar(100) NULL,
        phone varchar(50) NULL,
        mobile varchar(50) NULL,
        email varchar(150) NULL,
        is_primary tinyint NOT NULL DEFAULT 0,
        is_active tinyint NOT NULL DEFAULT 1,
        active_primary_supplier_id bigint GENERATED ALWAYS AS (
          CASE WHEN is_primary = 1 AND is_active = 1 THEN supplier_id ELSE NULL END
        ) STORED,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (supplier_contact_id),
        INDEX idx_supplier_contact_tenant_supplier (tenant_id, supplier_id),
        UNIQUE INDEX uq_supplier_contact_active_primary (active_primary_supplier_id),
        CONSTRAINT fk_supplier_contact_tenant FOREIGN KEY (tenant_id) REFERENCES tbl_tenant (tenant_id) ON DELETE RESTRICT,
        CONSTRAINT fk_supplier_contact_supplier FOREIGN KEY (supplier_id) REFERENCES tbl_supplier (supplier_id) ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      INSERT INTO tbl_supplier_address (
        tenant_id, supplier_id, address_type, address_line1, address_line2, city,
        is_primary, is_active, created_at, updated_at
      )
      SELECT
        supplier.tenant_id, supplier.supplier_id, 'REGISTERED', TRIM(supplier.address_line_1),
        NULLIF(TRIM(supplier.address_line_2), ''), NULLIF(TRIM(supplier.city), ''),
        1, supplier.is_active, supplier.created_at, supplier.updated_at
      FROM tbl_supplier supplier
      WHERE NULLIF(TRIM(supplier.address_line_1), '') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM tbl_supplier_address address_row
          WHERE address_row.tenant_id = supplier.tenant_id AND address_row.supplier_id = supplier.supplier_id
        )
    `);

    await queryRunner.query(`
      INSERT INTO tbl_supplier_contact (
        tenant_id, supplier_id, contact_name, phone, email,
        is_primary, is_active, created_at, updated_at
      )
      SELECT
        supplier.tenant_id, supplier.supplier_id,
        COALESCE(NULLIF(TRIM(supplier.contact_name), ''), supplier.supplier_name),
        NULLIF(TRIM(supplier.phone), ''), NULLIF(TRIM(supplier.email), ''),
        1, supplier.is_active, supplier.created_at, supplier.updated_at
      FROM tbl_supplier supplier
      WHERE (
        NULLIF(TRIM(supplier.contact_name), '') IS NOT NULL
        OR NULLIF(TRIM(supplier.phone), '') IS NOT NULL
        OR NULLIF(TRIM(supplier.email), '') IS NOT NULL
      )
        AND NOT EXISTS (
          SELECT 1 FROM tbl_supplier_contact contact_row
          WHERE contact_row.tenant_id = supplier.tenant_id AND contact_row.supplier_id = supplier.supplier_id
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS tbl_supplier_contact');
    await queryRunner.query('DROP TABLE IF EXISTS tbl_supplier_address');
    const supplier = await queryRunner.getTable('tbl_supplier');
    const codeIndex = supplier?.indices.find((index) => index.name === 'uq_supplier_tenant_code');
    if (supplier && codeIndex) await queryRunner.dropIndex(supplier, codeIndex);
  }
}
