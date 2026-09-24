import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class AddInventoryAdjustments1770000021000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE IF NOT EXISTS tbl_inventory_adjustment_reason (
        inventory_adjustment_reason_id bigint NOT NULL AUTO_INCREMENT,
        tenant_id bigint NOT NULL,
        code varchar(50) NOT NULL,
        name varchar(150) NOT NULL,
        allowed_direction varchar(10) NOT NULL,
        reason_category varchar(100) NULL,
        costing_policy varchar(30) NOT NULL,
        requires_remarks tinyint NOT NULL DEFAULT 0,
        requires_approval tinyint NOT NULL DEFAULT 0,
        is_system_reason tinyint NOT NULL DEFAULT 0,
        is_active tinyint NOT NULL DEFAULT 1,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (inventory_adjustment_reason_id),
        UNIQUE KEY uq_inventory_adjustment_reason_tenant_code (tenant_id, code),
        CONSTRAINT fk_inventory_adjustment_reason_tenant FOREIGN KEY (tenant_id) REFERENCES tbl_tenant(tenant_id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    await runner.query(`
      CREATE TABLE IF NOT EXISTS tbl_inventory_adjustment (
        inventory_adjustment_id bigint NOT NULL AUTO_INCREMENT,
        tenant_id bigint NOT NULL,
        adjustment_number varchar(50) NULL,
        location_id bigint NOT NULL,
        movement_type varchar(10) NOT NULL,
        reason_id bigint NOT NULL,
        adjustment_date date NOT NULL,
        reference_number varchar(100) NULL,
        remarks text NULL,
        status varchar(20) NOT NULL DEFAULT 'DRAFT',
        created_by_user_id bigint NOT NULL,
        posted_by_user_id bigint NULL,
        posted_at datetime NULL,
        cancelled_by_user_id bigint NULL,
        cancelled_at datetime NULL,
        is_active tinyint NOT NULL DEFAULT 1,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (inventory_adjustment_id),
        UNIQUE KEY uq_inventory_adjustment_tenant_number (tenant_id, adjustment_number),
        KEY idx_inventory_adjustment_tenant_date (tenant_id, adjustment_date),
        KEY idx_inventory_adjustment_location_status (location_id, status),
        CONSTRAINT fk_inventory_adjustment_tenant FOREIGN KEY (tenant_id) REFERENCES tbl_tenant(tenant_id) ON DELETE RESTRICT,
        CONSTRAINT fk_inventory_adjustment_location FOREIGN KEY (location_id) REFERENCES tbl_location(location_id) ON DELETE RESTRICT,
        CONSTRAINT fk_inventory_adjustment_reason FOREIGN KEY (reason_id) REFERENCES tbl_inventory_adjustment_reason(inventory_adjustment_reason_id) ON DELETE RESTRICT,
        CONSTRAINT fk_inventory_adjustment_created_user FOREIGN KEY (created_by_user_id) REFERENCES tbl_user(user_id) ON DELETE RESTRICT,
        CONSTRAINT fk_inventory_adjustment_posted_user FOREIGN KEY (posted_by_user_id) REFERENCES tbl_user(user_id) ON DELETE SET NULL,
        CONSTRAINT fk_inventory_adjustment_cancelled_user FOREIGN KEY (cancelled_by_user_id) REFERENCES tbl_user(user_id) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    await runner.query(`
      CREATE TABLE IF NOT EXISTS tbl_inventory_adjustment_line (
        inventory_adjustment_line_id bigint NOT NULL AUTO_INCREMENT,
        inventory_adjustment_id bigint NOT NULL,
        product_id bigint NOT NULL,
        product_unit_id bigint NOT NULL,
        conversion_factor_snapshot decimal(18,6) NOT NULL,
        quantity decimal(18,4) NOT NULL,
        base_quantity decimal(18,4) NOT NULL,
        unit_cost decimal(18,4) NULL,
        inventory_value decimal(18,4) NULL,
        remarks text NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (inventory_adjustment_line_id),
        UNIQUE KEY uq_inventory_adjustment_line_product (inventory_adjustment_id, product_id),
        CONSTRAINT fk_inventory_adjustment_line_header FOREIGN KEY (inventory_adjustment_id) REFERENCES tbl_inventory_adjustment(inventory_adjustment_id) ON DELETE CASCADE,
        CONSTRAINT fk_inventory_adjustment_line_product FOREIGN KEY (product_id) REFERENCES tbl_product(product_id) ON DELETE RESTRICT,
        CONSTRAINT fk_inventory_adjustment_line_product_unit FOREIGN KEY (product_unit_id) REFERENCES tbl_product_unit(product_unit_id) ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `);

    if (!(await runner.hasColumn('tbl_inventory_ledger', 'inventory_adjustment_reason_id')))
      await runner.addColumn('tbl_inventory_ledger', new TableColumn({ name: 'inventory_adjustment_reason_id', type: 'bigint', isNullable: true }));
    const ledger = (await runner.getTable('tbl_inventory_ledger'))!;
    if (!ledger.indices.some(index => index.name === 'idx_inventory_ledger_adjustment_reason'))
      await runner.createIndex('tbl_inventory_ledger', new TableIndex({ name: 'idx_inventory_ledger_adjustment_reason', columnNames: ['inventory_adjustment_reason_id'] }));
    if (!ledger.foreignKeys.some(key => key.name === 'fk_inventory_ledger_adjustment_reason'))
      await runner.createForeignKey('tbl_inventory_ledger', new TableForeignKey({ name: 'fk_inventory_ledger_adjustment_reason', columnNames: ['inventory_adjustment_reason_id'], referencedTableName: 'tbl_inventory_adjustment_reason', referencedColumnNames: ['inventory_adjustment_reason_id'], onDelete: 'RESTRICT' }));

    const reasons = [
      ['EXPIRY', 'Expiry', 'OUT', 'CURRENT_WAVG', 0],
      ['DAMAGE', 'Damage', 'OUT', 'CURRENT_WAVG', 0],
      ['WRITE_OFF', 'Write Off', 'OUT', 'CURRENT_WAVG', 0],
      ['STOCK_LOSS', 'Stock Loss', 'OUT', 'CURRENT_WAVG', 0],
      ['INVENTORY_CORRECTION', 'Inventory Correction', 'BOTH', 'CURRENT_WAVG', 0],
      ['CYCLE_RECONCILIATION', 'Cycle Reconciliation', 'BOTH', 'CURRENT_WAVG', 0],
      ['OPENING_INVENTORY', 'Opening Inventory', 'IN', 'MANUAL_REQUIRED', 0],
      ['OTHER', 'Other', 'BOTH', 'CURRENT_WAVG', 1],
    ];
    for (const [code, name, direction, costing, remarks] of reasons) await runner.query(`
      INSERT INTO tbl_inventory_adjustment_reason
        (tenant_id, code, name, allowed_direction, reason_category, costing_policy, requires_remarks, requires_approval, is_system_reason, is_active)
      SELECT tenant_id, ?, ?, ?, NULL, ?, ?, 0, 1, 1 FROM tbl_tenant
      ON DUPLICATE KEY UPDATE inventory_adjustment_reason_id = inventory_adjustment_reason_id
    `, [code, name, direction, costing, remarks]);
  }

  async down(runner: QueryRunner): Promise<void> {
    const [documents] = await runner.query('SELECT COUNT(*) AS n FROM tbl_inventory_adjustment');
    const [ledger] = await runner.query("SELECT COUNT(*) AS n FROM tbl_inventory_ledger WHERE source_document_type = 'INVENTORY_ADJUSTMENT' OR inventory_adjustment_reason_id IS NOT NULL");
    if (Number(documents.n) || Number(ledger.n)) throw new Error('Cannot roll back: inventory adjustment audit data exists. Keep the forward schema.');
    const ledgerTable = (await runner.getTable('tbl_inventory_ledger'))!;
    const foreignKey = ledgerTable.foreignKeys.find(key => key.name === 'fk_inventory_ledger_adjustment_reason');
    if (foreignKey) await runner.dropForeignKey(ledgerTable, foreignKey);
    const index = ledgerTable.indices.find(value => value.name === 'idx_inventory_ledger_adjustment_reason');
    if (index) await runner.dropIndex(ledgerTable, index);
    if (await runner.hasColumn('tbl_inventory_ledger', 'inventory_adjustment_reason_id')) await runner.dropColumn('tbl_inventory_ledger', 'inventory_adjustment_reason_id');
    await runner.dropTable('tbl_inventory_adjustment_line', true);
    await runner.dropTable('tbl_inventory_adjustment', true);
    await runner.dropTable('tbl_inventory_adjustment_reason', true);
  }
}
