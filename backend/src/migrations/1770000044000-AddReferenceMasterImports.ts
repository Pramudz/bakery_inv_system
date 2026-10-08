import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReferenceMasterImports1770000044000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE tbl_reference_import_batch (
      batch_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      master VARCHAR(30) NOT NULL,
      file_hash CHAR(64) NOT NULL,
      status VARCHAR(20) NOT NULL,
      rows_json LONGTEXT NOT NULL,
      results_json LONGTEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME NULL,
      UNIQUE KEY uq_reference_import_file (tenant_id, master, file_hash),
      KEY ix_reference_import_tenant (tenant_id),
      CONSTRAINT fk_reference_import_tenant FOREIGN KEY (tenant_id) REFERENCES tbl_tenant(tenant_id)
    ) ENGINE=InnoDB`);
    await runner.query(`CREATE TABLE tbl_supplier_import_ref (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      import_ref VARCHAR(100) NOT NULL,
      supplier_id BIGINT NOT NULL,
      supplier_code VARCHAR(50) NOT NULL,
      UNIQUE KEY uq_supplier_import_ref (tenant_id, import_ref),
      CONSTRAINT fk_supplier_import_ref_tenant FOREIGN KEY (tenant_id) REFERENCES tbl_tenant(tenant_id),
      CONSTRAINT fk_supplier_import_ref_supplier FOREIGN KEY (supplier_id) REFERENCES tbl_supplier(supplier_id)
    ) ENGINE=InnoDB`);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE tbl_supplier_import_ref');
    await runner.query('DROP TABLE tbl_reference_import_batch');
  }
}
