import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductBulkImports1770000045000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE tbl_product_import_batch (
      batch_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      import_type VARCHAR(40) NOT NULL,
      dataset_id VARCHAR(100) NOT NULL,
      file_hash CHAR(64) NOT NULL,
      status VARCHAR(20) NOT NULL,
      rows_json LONGTEXT NOT NULL,
      preview_json LONGTEXT NULL,
      results_json LONGTEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME NULL,
      UNIQUE KEY uq_product_import_file (tenant_id, import_type, dataset_id, file_hash),
      KEY ix_product_import_history (tenant_id, created_at),
      CONSTRAINT fk_product_import_tenant FOREIGN KEY (tenant_id) REFERENCES tbl_tenant(tenant_id)
    ) ENGINE=InnoDB`);
    await runner.query(`CREATE TABLE tbl_product_import_ref (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      dataset_id VARCHAR(100) NOT NULL,
      import_key VARCHAR(100) NOT NULL,
      product_id BIGINT NOT NULL,
      sku VARCHAR(100) NOT NULL,
      definition_hash CHAR(64) NOT NULL,
      batch_id BIGINT NOT NULL,
      UNIQUE KEY uq_product_import_ref (tenant_id, dataset_id, import_key),
      KEY ix_product_import_ref_product (product_id),
      CONSTRAINT fk_product_import_ref_tenant FOREIGN KEY (tenant_id) REFERENCES tbl_tenant(tenant_id),
      CONSTRAINT fk_product_import_ref_product FOREIGN KEY (product_id) REFERENCES tbl_product(product_id),
      CONSTRAINT fk_product_import_ref_batch FOREIGN KEY (batch_id) REFERENCES tbl_product_import_batch(batch_id)
    ) ENGINE=InnoDB`);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE tbl_product_import_ref');
    await runner.query('DROP TABLE tbl_product_import_batch');
  }
}
