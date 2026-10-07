import { MigrationInterface, QueryRunner } from 'typeorm';

/** Historical money comes only from document lines and linked inventory ledgers. */
export class AddPosSaleRefundSnapshots1770000041000 implements MigrationInterface {
  private async add(queryRunner: QueryRunner, table: string, name: string, definition: string) {
    if (!(await queryRunner.hasColumn(table, name))) {
      await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  }

  private async addIndex(queryRunner: QueryRunner, table: string, name: string, columns: string) {
    const current = await queryRunner.getTable(table);
    if (!current?.indices.some(index => index.name === name)) {
      await queryRunner.query(`ALTER TABLE ${table} ADD UNIQUE KEY ${name} (${columns})`);
    }
  }

  private async addForeignKey(queryRunner: QueryRunner, table: string, name: string, column: string, target: string, targetColumn: string) {
    const current = await queryRunner.getTable(table);
    if (!current?.foreignKeys.some(key => key.name === name)) {
      await queryRunner.query(`ALTER TABLE ${table} ADD CONSTRAINT ${name} FOREIGN KEY (${column}) REFERENCES ${target}(${targetColumn}) ON DELETE RESTRICT`);
    }
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.add(queryRunner, 'tbl_invoice', 'tax_total', 'DECIMAL(18,2) NOT NULL DEFAULT 0');

    const sale = 'tbl_invoice_detail';
    await this.add(queryRunner, sale, 'line_number', 'INT NULL');
    await this.add(queryRunner, sale, 'sku_snapshot', 'VARCHAR(100) NULL');
    await this.add(queryRunner, sale, 'product_name_snapshot', 'VARCHAR(255) NULL');
    await this.add(queryRunner, sale, 'unit_id', 'BIGINT NULL');
    await this.add(queryRunner, sale, 'unit_code_snapshot', 'VARCHAR(30) NULL');
    await this.add(queryRunner, sale, 'unit_name_snapshot', 'VARCHAR(100) NULL');
    await this.add(queryRunner, sale, 'unit_cost_snapshot', 'DECIMAL(18,4) NULL');
    await this.add(queryRunner, sale, 'cogs_amount', 'DECIMAL(18,4) NULL');
    await this.add(queryRunner, sale, 'price_source', 'VARCHAR(20) NULL');
    await this.add(queryRunner, sale, 'source_price_list_item_id', 'BIGINT NULL');
    await this.add(queryRunner, sale, 'source_quotation_line_id', 'BIGINT NULL');
    await this.add(queryRunner, sale, 'taxable_amount', 'DECIMAL(18,2) NULL');
    await this.add(queryRunner, sale, 'tax_amount', 'DECIMAL(18,2) NOT NULL DEFAULT 0');
    await this.add(queryRunner, sale, 'tax_rate_snapshot', 'DECIMAL(7,4) NOT NULL DEFAULT 0');
    await this.add(queryRunner, sale, 'tax_inclusive', 'TINYINT(1) NOT NULL DEFAULT 0');
    await this.add(queryRunner, sale, 'tax_code_snapshot', 'VARCHAR(50) NULL');

    const refund = 'tbl_invoice_refund_detail';
    await this.add(queryRunner, refund, 'line_number', 'INT NULL');
    await this.add(queryRunner, refund, 'original_unit_cost_snapshot', 'DECIMAL(18,4) NULL');
    await this.add(queryRunner, refund, 'cogs_reversal_amount', 'DECIMAL(18,4) NULL');
    await this.add(queryRunner, refund, 'refund_taxable_amount', 'DECIMAL(18,2) NULL');
    await this.add(queryRunner, refund, 'tax_refund_amount', 'DECIMAL(18,2) NOT NULL DEFAULT 0');
    await this.add(queryRunner, refund, 'tax_rate_snapshot', 'DECIMAL(7,4) NOT NULL DEFAULT 0');

    // IDs, not current row order, define a stable sequence for legacy lines.
    await queryRunner.query(`UPDATE tbl_invoice_detail detail
      JOIN (SELECT invoice_detail_id, ROW_NUMBER() OVER (PARTITION BY invoice_id ORDER BY invoice_detail_id) AS ordinal
            FROM tbl_invoice_detail) ordered ON ordered.invoice_detail_id = detail.invoice_detail_id
      SET detail.line_number = ordered.ordinal WHERE detail.line_number IS NULL`);
    await queryRunner.query(`UPDATE tbl_invoice_refund_detail detail
      JOIN (SELECT invoice_refund_detail_id,
                   ROW_NUMBER() OVER (PARTITION BY invoice_refund_id ORDER BY invoice_refund_detail_id) AS ordinal
            FROM tbl_invoice_refund_detail) ordered ON ordered.invoice_refund_detail_id = detail.invoice_refund_detail_id
      SET detail.line_number = ordered.ordinal WHERE detail.line_number IS NULL`);
    await queryRunner.query('ALTER TABLE tbl_invoice_detail MODIFY line_number INT NOT NULL');
    await queryRunner.query('ALTER TABLE tbl_invoice_refund_detail MODIFY line_number INT NOT NULL');
    await this.addIndex(queryRunner, sale, 'uq_invoice_detail_line_number', 'invoice_id, line_number');
    await this.addIndex(queryRunner, refund, 'uq_invoice_refund_detail_line_number', 'invoice_refund_id, line_number');

    // The old invoice line has no product/unit text. This descriptive backfill
    // uses quotation snapshots where available, otherwise current master data.
    await queryRunner.query(`UPDATE tbl_invoice_detail detail
      JOIN tbl_invoice invoice ON invoice.invoice_id = detail.invoice_id
      JOIN tbl_product product ON product.product_id = detail.product_id
      LEFT JOIN (SELECT quotation_id, product_id, MIN(quotation_line_id) AS quotation_line_id
                 FROM tbl_quotation_line GROUP BY quotation_id, product_id HAVING COUNT(*) = 1) quote_match
        ON quote_match.quotation_id = invoice.source_quotation_id AND quote_match.product_id = detail.product_id
      LEFT JOIN tbl_quotation_line quoted ON quoted.quotation_line_id = quote_match.quotation_line_id
      LEFT JOIN tbl_unit_of_measure unit ON unit.unit_id = COALESCE(quoted.unit_id, product.base_unit_id)
      SET detail.sku_snapshot = COALESCE(detail.sku_snapshot, quoted.product_code_snapshot, product.sku),
          detail.product_name_snapshot = COALESCE(detail.product_name_snapshot, quoted.product_name_snapshot, product.product_name),
          detail.unit_id = COALESCE(detail.unit_id, quoted.unit_id, product.base_unit_id),
          detail.unit_code_snapshot = COALESCE(detail.unit_code_snapshot, quoted.unit_code_snapshot, unit.code),
          detail.unit_name_snapshot = COALESCE(detail.unit_name_snapshot, quoted.unit_name_snapshot, unit.name),
          detail.source_quotation_line_id = COALESCE(detail.source_quotation_line_id, quoted.quotation_line_id),
          detail.price_source = COALESCE(detail.price_source, IF(invoice.source_quotation_id IS NULL, 'PRICE_LIST', 'QUOTATION')),
          detail.taxable_amount = COALESCE(detail.taxable_amount, detail.net_total)`);

    // Resolve legacy cost only from an exact linked SALE ledger with matching
    // quantity. Today's product stock flag cannot prove a historical zero cost.
    await queryRunner.query(`UPDATE tbl_invoice_detail detail
      JOIN tbl_invoice invoice ON invoice.invoice_id = detail.invoice_id
      LEFT JOIN (SELECT tenant_id, source_document_id AS invoice_id, source_document_line_id AS detail_id,
                        COUNT(*) AS entry_count, SUM(quantity_out) AS quantity_out,
                        SUM(movement_value) AS movement_value
                 FROM tbl_inventory_ledger WHERE source_document_type = 'INVOICE' AND movement_type = 'SALE'
                 GROUP BY tenant_id, source_document_id, source_document_line_id) ledger
        ON ledger.tenant_id = invoice.tenant_id AND ledger.invoice_id = invoice.invoice_id
       AND ledger.detail_id = detail.invoice_detail_id
      SET detail.unit_cost_snapshot = CASE
            WHEN ledger.entry_count > 0 AND detail.quantity > 0 AND ledger.quantity_out = detail.quantity AND ledger.movement_value >= 0
            THEN ROUND(ledger.movement_value / detail.quantity, 4) ELSE NULL END,
          detail.cogs_amount = CASE
            WHEN ledger.entry_count > 0 AND detail.quantity > 0 AND ledger.quantity_out = detail.quantity AND ledger.movement_value >= 0
            THEN ledger.movement_value ELSE NULL END
      WHERE detail.unit_cost_snapshot IS NULL AND detail.cogs_amount IS NULL`);

    await queryRunner.query(`UPDATE tbl_invoice_refund_detail detail
      JOIN tbl_invoice_refund refund ON refund.invoice_refund_id = detail.invoice_refund_id
      JOIN tbl_invoice_detail original ON original.invoice_detail_id = detail.invoice_detail_id
      LEFT JOIN tbl_inventory_ledger ledger ON ledger.tenant_id = refund.tenant_id
        AND ledger.source_document_type = 'INVOICE_REFUND' AND ledger.source_document_id = refund.invoice_refund_id
        AND ledger.source_document_line_id = detail.invoice_refund_detail_id AND ledger.movement_type = 'SALE_RETURN'
      SET detail.original_unit_cost_snapshot = original.unit_cost_snapshot,
          detail.cogs_reversal_amount = CASE WHEN ledger.inventory_ledger_id IS NOT NULL THEN ledger.movement_value
            WHEN detail.return_to_stock = 0 THEN 0 ELSE NULL END,
          detail.refund_taxable_amount = COALESCE(detail.refund_taxable_amount, detail.refund_amount)
      WHERE detail.original_unit_cost_snapshot IS NULL AND detail.cogs_reversal_amount IS NULL`);

    await this.addForeignKey(queryRunner, sale, 'fk_invoice_detail_sale_unit', 'unit_id', 'tbl_unit_of_measure', 'unit_id');
    await this.addForeignKey(queryRunner, sale, 'fk_invoice_detail_price_item', 'source_price_list_item_id', 'tbl_price_list_item', 'price_list_item_id');
    await this.addForeignKey(queryRunner, sale, 'fk_invoice_detail_quotation_line', 'source_quotation_line_id', 'tbl_quotation_line', 'quotation_line_id');

    const saleCounts: Array<{ total: number; backfilled: number; unresolved: number }> = await queryRunner.query(
      'SELECT COUNT(*) total, COUNT(CASE WHEN unit_cost_snapshot IS NOT NULL AND cogs_amount IS NOT NULL THEN 1 END) backfilled, COUNT(*)-COUNT(CASE WHEN unit_cost_snapshot IS NOT NULL AND cogs_amount IS NOT NULL THEN 1 END) unresolved FROM tbl_invoice_detail');
    const refundCounts: Array<{ total: number; backfilled: number; unresolved: number }> = await queryRunner.query(
      'SELECT COUNT(*) total, COUNT(CASE WHEN original_unit_cost_snapshot IS NOT NULL AND cogs_reversal_amount IS NOT NULL THEN 1 END) backfilled, COUNT(*)-COUNT(CASE WHEN original_unit_cost_snapshot IS NOT NULL AND cogs_reversal_amount IS NOT NULL THEN 1 END) unresolved FROM tbl_invoice_refund_detail');
    const differences: Array<{ legacyValuationDifferences: number }> = await queryRunner.query(`SELECT COUNT(*) AS legacyValuationDifferences
      FROM tbl_invoice_refund_detail detail
      WHERE detail.return_to_stock = 1
        AND detail.original_unit_cost_snapshot IS NOT NULL AND detail.cogs_reversal_amount IS NOT NULL
        AND ABS(detail.cogs_reversal_amount - ROUND(detail.quantity * detail.original_unit_cost_snapshot, 4)) > 0.00005`);
    console.info('POS snapshot migration backfill', { sale: saleCounts[0], refund: refundCounts[0], ...differences[0] });
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of ['fk_invoice_detail_quotation_line', 'fk_invoice_detail_price_item', 'fk_invoice_detail_sale_unit']) {
      await queryRunner.query(`ALTER TABLE tbl_invoice_detail DROP FOREIGN KEY ${name}`);
    }
    await queryRunner.query('ALTER TABLE tbl_invoice_detail DROP INDEX uq_invoice_detail_line_number');
    await queryRunner.query('ALTER TABLE tbl_invoice_refund_detail DROP INDEX uq_invoice_refund_detail_line_number');
    for (const name of ['tax_rate_snapshot', 'tax_refund_amount', 'refund_taxable_amount', 'cogs_reversal_amount', 'original_unit_cost_snapshot', 'line_number']) {
      await queryRunner.query(`ALTER TABLE tbl_invoice_refund_detail DROP COLUMN ${name}`);
    }
    for (const name of ['tax_code_snapshot', 'tax_inclusive', 'tax_rate_snapshot', 'tax_amount', 'taxable_amount', 'source_quotation_line_id', 'source_price_list_item_id', 'price_source', 'cogs_amount', 'unit_cost_snapshot', 'unit_name_snapshot', 'unit_code_snapshot', 'unit_id', 'product_name_snapshot', 'sku_snapshot', 'line_number']) {
      await queryRunner.query(`ALTER TABLE tbl_invoice_detail DROP COLUMN ${name}`);
    }
    await queryRunner.query('ALTER TABLE tbl_invoice DROP COLUMN tax_total');
  }
}
