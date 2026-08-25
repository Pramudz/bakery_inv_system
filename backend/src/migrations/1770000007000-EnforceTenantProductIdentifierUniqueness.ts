import { MigrationInterface, QueryRunner, TableForeignKey, TableIndex } from 'typeorm';

type DuplicateIdentifier = {
  tenant_id: string;
  normalized_value: string;
  duplicate_count: string;
  identifier_ids: string;
  product_ids: string;
};

export class EnforceTenantProductIdentifierUniqueness1770000007000 implements MigrationInterface {
  name = 'EnforceTenantProductIdentifierUniqueness1770000007000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const duplicates: DuplicateIdentifier[] = await queryRunner.query(`
      SELECT
        product.tenant_id,
        UPPER(TRIM(identifier_row.identifier_value)) AS normalized_value,
        COUNT(*) AS duplicate_count,
        GROUP_CONCAT(identifier_row.product_identifier_id ORDER BY identifier_row.product_identifier_id) AS identifier_ids,
        GROUP_CONCAT(DISTINCT identifier_row.product_id ORDER BY identifier_row.product_id) AS product_ids
      FROM tbl_product_identifier identifier_row
      INNER JOIN tbl_product product ON product.product_id = identifier_row.product_id
      GROUP BY product.tenant_id, UPPER(TRIM(identifier_row.identifier_value))
      HAVING COUNT(*) > 1
    `);
    if (duplicates.length) {
      const report = duplicates.map((row) =>
        `tenant=${row.tenant_id}, value=${JSON.stringify(row.normalized_value)}, identifier_ids=[${row.identifier_ids}], product_ids=[${row.product_ids}]`,
      ).join('; ');
      throw new Error(`Cannot create uq_product_identifier_tenant_normalized because duplicate product identifiers exist. Resolve ownership first; no records were changed. ${report}`);
    }

    const blanks: Array<{ identifier_ids: string }> = await queryRunner.query(`
      SELECT GROUP_CONCAT(product_identifier_id ORDER BY product_identifier_id) AS identifier_ids
      FROM tbl_product_identifier
      WHERE TRIM(identifier_value) = ''
      HAVING COUNT(*) > 0
    `);
    if (blanks.length)
      throw new Error(`Cannot normalize blank product identifiers. Resolve identifier_ids=[${blanks[0].identifier_ids}] first; no records were changed.`);

    let table = await queryRunner.getTable('tbl_product_identifier');
    if (!table) throw new Error('tbl_product_identifier does not exist');
    if (!table.findColumnByName('tenant_id'))
      await queryRunner.query('ALTER TABLE tbl_product_identifier ADD COLUMN tenant_id bigint NULL AFTER product_identifier_id');
    if (!table.findColumnByName('normalized_identifier_value'))
      await queryRunner.query('ALTER TABLE tbl_product_identifier ADD COLUMN normalized_identifier_value varchar(100) NULL AFTER identifier_value');

    await queryRunner.query(`
      UPDATE tbl_product_identifier identifier_row
      INNER JOIN tbl_product product ON product.product_id = identifier_row.product_id
      SET
        identifier_row.tenant_id = product.tenant_id,
        identifier_row.identifier_value = UPPER(TRIM(identifier_row.identifier_value)),
        identifier_row.normalized_identifier_value = UPPER(TRIM(identifier_row.identifier_value))
    `);
    await queryRunner.query('ALTER TABLE tbl_product_identifier MODIFY COLUMN tenant_id bigint NOT NULL');
    await queryRunner.query('ALTER TABLE tbl_product_identifier MODIFY COLUMN normalized_identifier_value varchar(100) NOT NULL');

    table = (await queryRunner.getTable('tbl_product_identifier'))!;
    if (!table.foreignKeys.some((key) => key.name === 'fk_product_identifier_tenant'))
      await queryRunner.createForeignKey(table, new TableForeignKey({
        name: 'fk_product_identifier_tenant',
        columnNames: ['tenant_id'],
        referencedTableName: 'tbl_tenant',
        referencedColumnNames: ['tenant_id'],
        onDelete: 'RESTRICT',
      }));
    table = (await queryRunner.getTable('tbl_product_identifier'))!;
    if (!table.indices.some((index) => index.name === 'uq_product_identifier_tenant_normalized'))
      await queryRunner.createIndex(table, new TableIndex({
        name: 'uq_product_identifier_tenant_normalized',
        columnNames: ['tenant_id', 'normalized_identifier_value'],
        isUnique: true,
      }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    let table = await queryRunner.getTable('tbl_product_identifier');
    if (!table) return;
    const unique = table.indices.find((index) => index.name === 'uq_product_identifier_tenant_normalized');
    if (unique) await queryRunner.dropIndex(table, unique);
    table = (await queryRunner.getTable('tbl_product_identifier'))!;
    const tenantForeignKey = table.foreignKeys.find((key) => key.name === 'fk_product_identifier_tenant');
    if (tenantForeignKey) await queryRunner.dropForeignKey(table, tenantForeignKey);
    table = (await queryRunner.getTable('tbl_product_identifier'))!;
    if (table.findColumnByName('normalized_identifier_value')) await queryRunner.dropColumn(table, 'normalized_identifier_value');
    table = (await queryRunner.getTable('tbl_product_identifier'))!;
    if (table.findColumnByName('tenant_id')) await queryRunner.dropColumn(table, 'tenant_id');
  }
}
