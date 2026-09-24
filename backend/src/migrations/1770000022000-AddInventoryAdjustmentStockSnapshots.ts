import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddInventoryAdjustmentStockSnapshots1770000022000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasColumn('tbl_inventory_adjustment_line', 'quantity_before'))) {
      await runner.addColumn('tbl_inventory_adjustment_line', new TableColumn({
        name: 'quantity_before', type: 'decimal', precision: 18, scale: 4, isNullable: true,
      }));
    }
    if (!(await runner.hasColumn('tbl_inventory_adjustment_line', 'quantity_after'))) {
      await runner.addColumn('tbl_inventory_adjustment_line', new TableColumn({
        name: 'quantity_after', type: 'decimal', precision: 18, scale: 4, isNullable: true,
      }));
    }

    // Inventory adjustment ledgers already hold authoritative posting-time snapshots.
    // Only rows with an exact source-line match are backfilled; unmatched history stays nullable.
    await runner.query(`
      UPDATE tbl_inventory_adjustment_line line_row
      INNER JOIN tbl_inventory_adjustment adjustment
        ON adjustment.inventory_adjustment_id = line_row.inventory_adjustment_id
       AND adjustment.status = 'POSTED'
      INNER JOIN tbl_inventory_ledger ledger
        ON ledger.tenant_id = adjustment.tenant_id
       AND ledger.source_document_type = 'INVENTORY_ADJUSTMENT'
       AND ledger.source_document_id = adjustment.inventory_adjustment_id
       AND ledger.source_document_line_id = line_row.inventory_adjustment_line_id
      SET line_row.quantity_before = ledger.quantity_before,
          line_row.quantity_after = ledger.quantity_after
      WHERE line_row.quantity_before IS NULL OR line_row.quantity_after IS NULL
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    if (await runner.hasColumn('tbl_inventory_adjustment_line', 'quantity_after'))
      await runner.dropColumn('tbl_inventory_adjustment_line', 'quantity_after');
    if (await runner.hasColumn('tbl_inventory_adjustment_line', 'quantity_before'))
      await runner.dropColumn('tbl_inventory_adjustment_line', 'quantity_before');
  }
}
