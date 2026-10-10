import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOpeningInventoryBulkImports1770000046000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE tbl_opening_inventory_import_batch (
      batch_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      dataset_id VARCHAR(100) NOT NULL,
      file_hash CHAR(64) NOT NULL,
      status VARCHAR(20) NOT NULL,
      rows_json LONGTEXT NOT NULL,
      preview_json LONGTEXT NULL,
      results_json LONGTEXT NULL,
      created_by_user_id BIGINT NOT NULL,
      confirmed_by_user_id BIGINT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME NULL,
      UNIQUE KEY uq_opening_import_file (tenant_id, dataset_id, file_hash),
      KEY ix_opening_import_history (tenant_id, created_at, batch_id),
      CONSTRAINT fk_opening_import_tenant FOREIGN KEY (tenant_id) REFERENCES tbl_tenant(tenant_id),
      CONSTRAINT fk_opening_import_creator FOREIGN KEY (created_by_user_id) REFERENCES tbl_user(user_id),
      CONSTRAINT fk_opening_import_confirmer FOREIGN KEY (confirmed_by_user_id) REFERENCES tbl_user(user_id)
    ) ENGINE=InnoDB`);
    await runner.query(`CREATE TABLE tbl_inventory_opening_claim (
      inventory_opening_claim_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      product_id BIGINT NOT NULL,
      location_id BIGINT NOT NULL,
      source_import_batch_id BIGINT NULL,
      source_adjustment_id BIGINT NOT NULL,
      source_adjustment_line_id BIGINT NOT NULL,
      created_by_user_id BIGINT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_inventory_opening_target (tenant_id, product_id, location_id),
      KEY ix_inventory_opening_batch (source_import_batch_id),
      CONSTRAINT fk_inventory_opening_tenant FOREIGN KEY (tenant_id) REFERENCES tbl_tenant(tenant_id),
      CONSTRAINT fk_inventory_opening_product FOREIGN KEY (product_id) REFERENCES tbl_product(product_id),
      CONSTRAINT fk_inventory_opening_location FOREIGN KEY (location_id) REFERENCES tbl_location(location_id),
      CONSTRAINT fk_inventory_opening_batch FOREIGN KEY (source_import_batch_id) REFERENCES tbl_opening_inventory_import_batch(batch_id),
      CONSTRAINT fk_inventory_opening_adjustment FOREIGN KEY (source_adjustment_id) REFERENCES tbl_inventory_adjustment(inventory_adjustment_id),
      CONSTRAINT fk_inventory_opening_line FOREIGN KEY (source_adjustment_line_id) REFERENCES tbl_inventory_adjustment_line(inventory_adjustment_line_id),
      CONSTRAINT fk_inventory_opening_actor FOREIGN KEY (created_by_user_id) REFERENCES tbl_user(user_id)
    ) ENGINE=InnoDB`);
    await runner.query('CREATE INDEX ix_inventory_ledger_opening_history ON tbl_inventory_ledger (tenant_id, product_id, location_id, inventory_ledger_id)');
    await runner.query('CREATE INDEX ix_inventory_age_opening_history ON tbl_inventory_age_layer (tenant_id, product_id, location_id, inventory_age_layer_id)');
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP INDEX ix_inventory_age_opening_history ON tbl_inventory_age_layer');
    await runner.query('DROP INDEX ix_inventory_ledger_opening_history ON tbl_inventory_ledger');
    await runner.query('DROP TABLE tbl_inventory_opening_claim');
    await runner.query('DROP TABLE tbl_opening_inventory_import_batch');
  }
}
