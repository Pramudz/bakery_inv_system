import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStockTransfersAndInventoryAging1770000042000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE IF NOT EXISTS tbl_stock_transfer (
      stock_transfer_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL, transfer_number VARCHAR(50) NOT NULL,
      source_location_id BIGINT NOT NULL, destination_location_id BIGINT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'DRAFT', transfer_date DATE NOT NULL,
      dispatch_business_date DATE NULL, receipt_completed_business_date DATE NULL,
      dispatched_at DATETIME NULL, dispatched_by_user_id BIGINT NULL,
      received_completed_at DATETIME NULL, received_completed_by_user_id BIGINT NULL,
      dispatch_key CHAR(36) NULL, dispatch_fingerprint CHAR(64) NULL,
      dispatch_reference VARCHAR(100) NULL, carrier_reference VARCHAR(100) NULL,
      tracking_reference VARCHAR(100) NULL, vehicle_reference VARCHAR(100) NULL,
      expected_arrival_date DATE NULL, remarks TEXT NULL,
      created_by_user_id BIGINT NOT NULL, cancelled_at DATETIME NULL, cancelled_by_user_id BIGINT NULL,
      CONSTRAINT chk_stock_transfer_distinct_locations CHECK (source_location_id <> destination_location_id),
      CONSTRAINT chk_stock_transfer_status CHECK (status IN ('DRAFT','DISPATCHED','PART_RECEIVED','RECEIVED','CANCELLED')),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_stock_transfer_tenant_number (tenant_id, transfer_number),
      UNIQUE KEY uq_stock_transfer_dispatch_key (tenant_id, dispatch_key),
      KEY idx_stock_transfer_tenant_status (tenant_id, status),
      KEY idx_stock_transfer_source (tenant_id, source_location_id),
      KEY idx_stock_transfer_destination (tenant_id, destination_location_id),
      CONSTRAINT fk_stock_transfer_tenant FOREIGN KEY (tenant_id) REFERENCES tbl_tenant(tenant_id),
      CONSTRAINT fk_stock_transfer_source FOREIGN KEY (source_location_id) REFERENCES tbl_location(location_id),
      CONSTRAINT fk_stock_transfer_destination FOREIGN KEY (destination_location_id) REFERENCES tbl_location(location_id),
      CONSTRAINT fk_stock_transfer_creator FOREIGN KEY (created_by_user_id) REFERENCES tbl_user(user_id),
      CONSTRAINT fk_stock_transfer_dispatcher FOREIGN KEY (dispatched_by_user_id) REFERENCES tbl_user(user_id),
      CONSTRAINT fk_stock_transfer_receiver FOREIGN KEY (received_completed_by_user_id) REFERENCES tbl_user(user_id),
      CONSTRAINT fk_stock_transfer_canceller FOREIGN KEY (cancelled_by_user_id) REFERENCES tbl_user(user_id)
    ) ENGINE=InnoDB`);
    await runner.query(`CREATE TABLE IF NOT EXISTS tbl_stock_transfer_line (
      stock_transfer_line_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      stock_transfer_id BIGINT NOT NULL, line_number INT NOT NULL,
      product_id BIGINT NOT NULL, unit_id BIGINT NOT NULL,
      requested_quantity DECIMAL(18,4) NOT NULL,
      dispatched_quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
      received_quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
      unit_cost_snapshot DECIMAL(18,4) NULL, transfer_value DECIMAL(18,4) NULL,
      CONSTRAINT chk_stock_transfer_line_quantities CHECK (requested_quantity > 0 AND dispatched_quantity >= 0
        AND received_quantity >= 0 AND dispatched_quantity <= requested_quantity AND received_quantity <= dispatched_quantity),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_stock_transfer_line_number (stock_transfer_id, line_number),
      KEY idx_stock_transfer_line_product (product_id),
      KEY idx_stock_transfer_line_unit (unit_id),
      CONSTRAINT fk_stock_transfer_line_header FOREIGN KEY (stock_transfer_id) REFERENCES tbl_stock_transfer(stock_transfer_id),
      CONSTRAINT fk_stock_transfer_line_product FOREIGN KEY (product_id) REFERENCES tbl_product(product_id),
      CONSTRAINT fk_stock_transfer_line_unit FOREIGN KEY (unit_id) REFERENCES tbl_unit_of_measure(unit_id)
    ) ENGINE=InnoDB`);
    await runner.query(`CREATE TABLE IF NOT EXISTS tbl_stock_transfer_age_allocation (
      stock_transfer_age_allocation_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      stock_transfer_line_id BIGINT NOT NULL, origin_aging_date DATE NULL,
      dispatched_quantity DECIMAL(18,4) NOT NULL,
      received_quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
      CONSTRAINT chk_transfer_age_quantities CHECK (dispatched_quantity > 0 AND received_quantity >= 0 AND received_quantity <= dispatched_quantity),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_transfer_age_line_date (stock_transfer_line_id, origin_aging_date),
      CONSTRAINT fk_transfer_age_line FOREIGN KEY (stock_transfer_line_id) REFERENCES tbl_stock_transfer_line(stock_transfer_line_id)
    ) ENGINE=InnoDB`);
    await runner.query(`CREATE TABLE IF NOT EXISTS tbl_stock_transfer_receipt (
      stock_transfer_receipt_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL, stock_transfer_id BIGINT NOT NULL,
      receipt_key CHAR(36) NOT NULL, request_fingerprint CHAR(64) NOT NULL,
      received_business_date DATE NOT NULL, received_at DATETIME NOT NULL,
      received_by_user_id BIGINT NOT NULL,
      result_snapshot JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_stock_transfer_receipt_key (tenant_id, receipt_key),
      KEY idx_stock_transfer_receipt_transfer (stock_transfer_id),
      CONSTRAINT fk_stock_transfer_receipt_tenant FOREIGN KEY (tenant_id) REFERENCES tbl_tenant(tenant_id),
      CONSTRAINT fk_stock_transfer_receipt_header FOREIGN KEY (stock_transfer_id) REFERENCES tbl_stock_transfer(stock_transfer_id),
      CONSTRAINT fk_stock_transfer_receipt_user FOREIGN KEY (received_by_user_id) REFERENCES tbl_user(user_id)
    ) ENGINE=InnoDB`);
    await runner.query(`CREATE TABLE IF NOT EXISTS tbl_stock_transfer_receipt_line (
      stock_transfer_receipt_line_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      stock_transfer_receipt_id BIGINT NOT NULL, stock_transfer_line_id BIGINT NOT NULL,
      received_quantity DECIMAL(18,4) NOT NULL, received_value DECIMAL(18,4) NOT NULL,
      CONSTRAINT chk_transfer_receipt_line_quantity CHECK (received_quantity > 0 AND received_value >= 0),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_stock_transfer_receipt_line (stock_transfer_receipt_id, stock_transfer_line_id),
      KEY idx_stock_transfer_receipt_line_transfer (stock_transfer_line_id),
      CONSTRAINT fk_stock_transfer_receipt_line_receipt FOREIGN KEY (stock_transfer_receipt_id) REFERENCES tbl_stock_transfer_receipt(stock_transfer_receipt_id),
      CONSTRAINT fk_stock_transfer_receipt_line_transfer FOREIGN KEY (stock_transfer_line_id) REFERENCES tbl_stock_transfer_line(stock_transfer_line_id)
    ) ENGINE=InnoDB`);
    await runner.query(`CREATE TABLE IF NOT EXISTS tbl_inventory_aging_snapshot (
      inventory_aging_snapshot_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL, snapshot_date DATE NOT NULL,
      location_id BIGINT NOT NULL, product_id BIGINT NOT NULL,
      quantity_on_hand DECIMAL(18,4) NOT NULL, average_cost DECIMAL(18,4) NOT NULL,
      inventory_value DECIMAL(18,4) NOT NULL,
      qty_0_30 DECIMAL(18,4) NOT NULL, qty_31_60 DECIMAL(18,4) NOT NULL,
      qty_61_90 DECIMAL(18,4) NOT NULL, qty_91_180 DECIMAL(18,4) NOT NULL,
      qty_181_365 DECIMAL(18,4) NOT NULL, qty_365_plus DECIMAL(18,4) NOT NULL,
      unknown_qty DECIMAL(18,4) NOT NULL, attributed_qty DECIMAL(18,4) NOT NULL,
      aging_coverage_percentage DECIMAL(7,4) NOT NULL,
      average_age_days DECIMAL(12,4) NULL, oldest_age_days INT NULL,
      CONSTRAINT chk_inventory_aging_reconcile CHECK (quantity_on_hand >= 0 AND
        qty_0_30 + qty_31_60 + qty_61_90 + qty_91_180 + qty_181_365 + qty_365_plus + unknown_qty = quantity_on_hand),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_inventory_aging_snapshot_scope (tenant_id, snapshot_date, location_id, product_id),
      KEY idx_inventory_aging_snapshot_location_product (location_id, product_id),
      CONSTRAINT fk_inventory_aging_snapshot_tenant FOREIGN KEY (tenant_id) REFERENCES tbl_tenant(tenant_id),
      CONSTRAINT fk_inventory_aging_snapshot_location FOREIGN KEY (location_id) REFERENCES tbl_location(location_id),
      CONSTRAINT fk_inventory_aging_snapshot_product FOREIGN KEY (product_id) REFERENCES tbl_product(product_id)
    ) ENGINE=InnoDB`);
    const indexes: Array<{ Key_name: string }> = await runner.query('SHOW INDEX FROM tbl_inventory_ledger WHERE Key_name = ?', ['idx_inventory_ledger_aging']);
    if (!indexes.length) await runner.query('CREATE INDEX idx_inventory_ledger_aging ON tbl_inventory_ledger (tenant_id, movement_type, location_id, product_id, movement_date, inventory_ledger_id)');
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP INDEX idx_inventory_ledger_aging ON tbl_inventory_ledger');
    for (const table of ['tbl_inventory_aging_snapshot', 'tbl_stock_transfer_receipt_line', 'tbl_stock_transfer_receipt', 'tbl_stock_transfer_age_allocation', 'tbl_stock_transfer_line', 'tbl_stock_transfer']) {
      await runner.query(`DROP TABLE IF EXISTS ${table}`);
    }
  }
}
