import { MigrationInterface, QueryRunner } from 'typeorm';

export class SimplifySupplierDirectDetails1770000004000 implements MigrationInterface {
  name = 'SimplifySupplierDirectDetails1770000004000';

  async up(queryRunner: QueryRunner): Promise<void> {
    let supplier = await queryRunner.getTable('tbl_supplier');
    if (!supplier) throw new Error('tbl_supplier does not exist');

    if (supplier.findColumnByName('address_line_1') && !supplier.findColumnByName('address_line1')) {
      await queryRunner.renameColumn('tbl_supplier', 'address_line_1', 'address_line1');
    }
    if (supplier.findColumnByName('address_line_2') && !supplier.findColumnByName('address_line2')) {
      await queryRunner.renameColumn('tbl_supplier', 'address_line_2', 'address_line2');
    }
    supplier = (await queryRunner.getTable('tbl_supplier'))!;
    for (const [name, definition] of [
      ['mobile', 'varchar(50) NULL'],
      ['district_or_state', 'varchar(100) NULL'],
      ['postal_code', 'varchar(30) NULL'],
      ['country_code', 'varchar(2) NULL'],
    ]) {
      if (!supplier.findColumnByName(name)) await queryRunner.query(`ALTER TABLE tbl_supplier ADD COLUMN ${name} ${definition}`);
    }
    const phone = (await queryRunner.getTable('tbl_supplier'))?.findColumnByName('phone');
    if (phone && phone.length && Number(phone.length) < 50) await queryRunner.query('ALTER TABLE tbl_supplier MODIFY COLUMN phone varchar(50) NULL');

    if (await queryRunner.hasTable('tbl_supplier_contact')) {
      await queryRunner.query(`
        UPDATE tbl_supplier supplier
        SET
          supplier.contact_name = COALESCE(NULLIF(TRIM(supplier.contact_name), ''), (
            SELECT contact.contact_name FROM tbl_supplier_contact contact
            WHERE contact.tenant_id = supplier.tenant_id AND contact.supplier_id = supplier.supplier_id AND contact.is_active = 1
            ORDER BY contact.is_primary DESC, contact.supplier_contact_id ASC LIMIT 1
          )),
          supplier.phone = COALESCE(NULLIF(TRIM(supplier.phone), ''), (
            SELECT contact.phone FROM tbl_supplier_contact contact
            WHERE contact.tenant_id = supplier.tenant_id AND contact.supplier_id = supplier.supplier_id AND contact.is_active = 1 AND NULLIF(TRIM(contact.phone), '') IS NOT NULL
            ORDER BY contact.is_primary DESC, contact.supplier_contact_id ASC LIMIT 1
          )),
          supplier.mobile = COALESCE(NULLIF(TRIM(supplier.mobile), ''), (
            SELECT contact.mobile FROM tbl_supplier_contact contact
            WHERE contact.tenant_id = supplier.tenant_id AND contact.supplier_id = supplier.supplier_id AND contact.is_active = 1 AND NULLIF(TRIM(contact.mobile), '') IS NOT NULL
            ORDER BY contact.is_primary DESC, contact.supplier_contact_id ASC LIMIT 1
          )),
          supplier.email = COALESCE(NULLIF(TRIM(supplier.email), ''), (
            SELECT contact.email FROM tbl_supplier_contact contact
            WHERE contact.tenant_id = supplier.tenant_id AND contact.supplier_id = supplier.supplier_id AND contact.is_active = 1 AND NULLIF(TRIM(contact.email), '') IS NOT NULL
            ORDER BY contact.is_primary DESC, contact.supplier_contact_id ASC LIMIT 1
          ))
      `);
    }

    if (await queryRunner.hasTable('tbl_supplier_address')) {
      await queryRunner.query(`
        UPDATE tbl_supplier supplier
        SET
          supplier.address_line1 = COALESCE(NULLIF(TRIM(supplier.address_line1), ''), (
            SELECT address_row.address_line1 FROM tbl_supplier_address address_row
            WHERE address_row.tenant_id = supplier.tenant_id AND address_row.supplier_id = supplier.supplier_id AND address_row.is_active = 1
            ORDER BY address_row.is_primary DESC, address_row.supplier_address_id ASC LIMIT 1
          )),
          supplier.address_line2 = COALESCE(NULLIF(TRIM(supplier.address_line2), ''), (
            SELECT address_row.address_line2 FROM tbl_supplier_address address_row
            WHERE address_row.tenant_id = supplier.tenant_id AND address_row.supplier_id = supplier.supplier_id AND address_row.is_active = 1 AND NULLIF(TRIM(address_row.address_line2), '') IS NOT NULL
            ORDER BY address_row.is_primary DESC, address_row.supplier_address_id ASC LIMIT 1
          )),
          supplier.city = COALESCE(NULLIF(TRIM(supplier.city), ''), (
            SELECT address_row.city FROM tbl_supplier_address address_row
            WHERE address_row.tenant_id = supplier.tenant_id AND address_row.supplier_id = supplier.supplier_id AND address_row.is_active = 1 AND NULLIF(TRIM(address_row.city), '') IS NOT NULL
            ORDER BY address_row.is_primary DESC, address_row.supplier_address_id ASC LIMIT 1
          )),
          supplier.district_or_state = COALESCE(NULLIF(TRIM(supplier.district_or_state), ''), (
            SELECT address_row.district_or_state FROM tbl_supplier_address address_row
            WHERE address_row.tenant_id = supplier.tenant_id AND address_row.supplier_id = supplier.supplier_id AND address_row.is_active = 1 AND NULLIF(TRIM(address_row.district_or_state), '') IS NOT NULL
            ORDER BY address_row.is_primary DESC, address_row.supplier_address_id ASC LIMIT 1
          )),
          supplier.postal_code = COALESCE(NULLIF(TRIM(supplier.postal_code), ''), (
            SELECT address_row.postal_code FROM tbl_supplier_address address_row
            WHERE address_row.tenant_id = supplier.tenant_id AND address_row.supplier_id = supplier.supplier_id AND address_row.is_active = 1 AND NULLIF(TRIM(address_row.postal_code), '') IS NOT NULL
            ORDER BY address_row.is_primary DESC, address_row.supplier_address_id ASC LIMIT 1
          )),
          supplier.country_code = COALESCE(NULLIF(TRIM(supplier.country_code), ''), (
            SELECT address_row.country_code FROM tbl_supplier_address address_row
            WHERE address_row.tenant_id = supplier.tenant_id AND address_row.supplier_id = supplier.supplier_id AND address_row.is_active = 1 AND NULLIF(TRIM(address_row.country_code), '') IS NOT NULL
            ORDER BY address_row.is_primary DESC, address_row.supplier_address_id ASC LIMIT 1
          ))
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Preserve all direct and nested data during rollback. Only restore legacy
    // address column names required by the previous application version.
    const supplier = await queryRunner.getTable('tbl_supplier');
    if (supplier?.findColumnByName('address_line1') && !supplier.findColumnByName('address_line_1')) await queryRunner.renameColumn('tbl_supplier', 'address_line1', 'address_line_1');
    const refreshed = await queryRunner.getTable('tbl_supplier');
    if (refreshed?.findColumnByName('address_line2') && !refreshed.findColumnByName('address_line_2')) await queryRunner.renameColumn('tbl_supplier', 'address_line2', 'address_line_2');
  }
}
