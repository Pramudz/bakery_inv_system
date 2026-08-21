import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReconcileSkuNumberSequences1770000012000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO tbl_number_sequence (tenant_id, sequence_key, scope_key, period_key, last_number)
      SELECT product.tenant_id, 'SKU', 'TENANT', 'NEVER',
             MAX(CAST(SUBSTRING(product.sku, 5) AS UNSIGNED))
      FROM tbl_product product
      WHERE product.sku REGEXP '^SKU-[0-9]+$'
      GROUP BY product.tenant_id
      ON DUPLICATE KEY UPDATE
        last_number = GREATEST(tbl_number_sequence.last_number, VALUES(last_number)),
        updated_at = CURRENT_TIMESTAMP
    `);

    const columns: Array<{ column_count: string | number }> = await queryRunner.query(`
      SELECT COUNT(*) AS column_count
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'tbl_number_sequence'
        AND column_name = 'tenant_sequence_key_guard'
    `);
    if (Number(columns[0]?.column_count ?? 0) === 0)
      await queryRunner.query(`ALTER TABLE tbl_number_sequence ADD COLUMN tenant_sequence_key_guard varchar(50) GENERATED ALWAYS AS (CASE WHEN scope_key = 'TENANT' AND period_key = 'NEVER' THEN sequence_key ELSE NULL END) STORED`);
    const indexes: Array<{ index_count: string | number }> = await queryRunner.query(`
      SELECT COUNT(*) AS index_count
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'tbl_number_sequence'
        AND index_name = 'uq_number_sequence_tenant_key'
    `);
    if (Number(indexes[0]?.index_count ?? 0) === 0)
      await queryRunner.query(`CREATE UNIQUE INDEX uq_number_sequence_tenant_key ON tbl_number_sequence (tenant_id, tenant_sequence_key_guard)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const indexes: Array<{ index_count: string | number }> = await queryRunner.query(`SELECT COUNT(*) AS index_count FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'tbl_number_sequence' AND index_name = 'uq_number_sequence_tenant_key'`);
    if (Number(indexes[0]?.index_count ?? 0) > 0) await queryRunner.query(`DROP INDEX uq_number_sequence_tenant_key ON tbl_number_sequence`);
    const columns: Array<{ column_count: string | number }> = await queryRunner.query(`SELECT COUNT(*) AS column_count FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tbl_number_sequence' AND column_name = 'tenant_sequence_key_guard'`);
    if (Number(columns[0]?.column_count ?? 0) > 0)
      await queryRunner.query(`ALTER TABLE tbl_number_sequence DROP COLUMN tenant_sequence_key_guard`);
  }
}
