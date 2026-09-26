import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInventoryConversions1770000023000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE IF NOT EXISTS tbl_inventory_conversion (
        inventory_conversion_id bigint NOT NULL AUTO_INCREMENT,
        tenant_id bigint NOT NULL,
        conversion_number varchar(50) NULL,
        location_id bigint NOT NULL,
        conversion_date date NOT NULL,
        allocation_method varchar(30) NOT NULL,
        remarks text NULL,
        status varchar(20) NOT NULL DEFAULT 'DRAFT',
        total_input_value decimal(18,4) NULL,
        total_output_value decimal(18,4) NULL,
        value_variance decimal(18,4) NULL,
        created_by_user_id bigint NOT NULL,
        posted_by_user_id bigint NULL,
        posted_at datetime NULL,
        cancelled_by_user_id bigint NULL,
        cancelled_at datetime NULL,
        is_active tinyint NOT NULL DEFAULT 1,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (inventory_conversion_id),
        UNIQUE KEY uq_inventory_conversion_tenant_number (tenant_id, conversion_number),
        KEY idx_inventory_conversion_tenant_date (tenant_id, conversion_date),
        KEY idx_inventory_conversion_location_status (location_id, status),
        CONSTRAINT fk_inventory_conversion_tenant FOREIGN KEY (tenant_id) REFERENCES tbl_tenant(tenant_id) ON DELETE RESTRICT,
        CONSTRAINT fk_inventory_conversion_location FOREIGN KEY (location_id) REFERENCES tbl_location(location_id) ON DELETE RESTRICT,
        CONSTRAINT fk_inventory_conversion_created_user FOREIGN KEY (created_by_user_id) REFERENCES tbl_user(user_id) ON DELETE RESTRICT,
        CONSTRAINT fk_inventory_conversion_posted_user FOREIGN KEY (posted_by_user_id) REFERENCES tbl_user(user_id) ON DELETE SET NULL,
        CONSTRAINT fk_inventory_conversion_cancelled_user FOREIGN KEY (cancelled_by_user_id) REFERENCES tbl_user(user_id) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    await runner.query(`
      CREATE TABLE IF NOT EXISTS tbl_inventory_conversion_line (
        inventory_conversion_line_id bigint NOT NULL AUTO_INCREMENT,
        inventory_conversion_id bigint NOT NULL,
        movement_type varchar(10) NOT NULL,
        product_id bigint NOT NULL,
        product_unit_id bigint NOT NULL,
        conversion_factor_snapshot decimal(18,6) NOT NULL,
        quantity decimal(18,4) NOT NULL,
        base_quantity decimal(18,4) NOT NULL,
        quantity_before decimal(18,4) NULL,
        quantity_after decimal(18,4) NULL,
        wavg_before decimal(18,4) NULL,
        wavg_after decimal(18,4) NULL,
        posted_unit_cost decimal(18,4) NULL,
        posted_value decimal(18,4) NULL,
        allocation_percent decimal(9,4) NULL,
        allocation_basis_value decimal(18,4) NULL,
        allocated_value decimal(18,4) NULL,
        allocation_weight decimal(18,4) NULL,
        remarks text NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (inventory_conversion_line_id),
        UNIQUE KEY uq_inventory_conversion_line_side_product (inventory_conversion_id, movement_type, product_id),
        KEY idx_inventory_conversion_line_product (product_id),
        CONSTRAINT fk_inventory_conversion_line_header FOREIGN KEY (inventory_conversion_id) REFERENCES tbl_inventory_conversion(inventory_conversion_id) ON DELETE CASCADE,
        CONSTRAINT fk_inventory_conversion_line_product FOREIGN KEY (product_id) REFERENCES tbl_product(product_id) ON DELETE RESTRICT,
        CONSTRAINT fk_inventory_conversion_line_product_unit FOREIGN KEY (product_unit_id) REFERENCES tbl_product_unit(product_unit_id) ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const [documents] = await runner.query('SELECT COUNT(*) AS n FROM tbl_inventory_conversion');
    const [ledger] = await runner.query("SELECT COUNT(*) AS n FROM tbl_inventory_ledger WHERE source_document_type = 'INVENTORY_CONVERSION'");
    if (Number(documents.n) || Number(ledger.n)) throw new Error('Cannot roll back: inventory conversion audit data exists. Keep the forward schema.');
    await runner.dropTable('tbl_inventory_conversion_line', true);
    await runner.dropTable('tbl_inventory_conversion', true);
  }
}
