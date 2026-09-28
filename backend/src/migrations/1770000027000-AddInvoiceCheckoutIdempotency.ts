import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddInvoiceCheckoutIdempotency1770000027000 implements MigrationInterface {
  name = 'AddInvoiceCheckoutIdempotency1770000027000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('tbl_invoice'))) throw new Error('tbl_invoice must exist before adding checkout idempotency.');
    if (!(await queryRunner.hasColumn('tbl_invoice', 'checkout_key'))) {
      await queryRunner.addColumn('tbl_invoice', new TableColumn({ name: 'checkout_key', type: 'varchar', length: '36', isNullable: true }));
    }
    if (!(await queryRunner.hasColumn('tbl_invoice', 'checkout_fingerprint'))) {
      await queryRunner.addColumn('tbl_invoice', new TableColumn({ name: 'checkout_fingerprint', type: 'char', length: '64', isNullable: true }));
    }
    await queryRunner.query(`UPDATE tbl_invoice
      SET checkout_key = COALESCE(checkout_key, UUID()),
          checkout_fingerprint = COALESCE(checkout_fingerprint, SHA2(CONCAT('legacy-invoice:', invoice_id), 256))
      WHERE checkout_key IS NULL OR checkout_fingerprint IS NULL`);
    const table = await queryRunner.getTable('tbl_invoice');
    const checkoutKey = table?.findColumnByName('checkout_key');
    const checkoutFingerprint = table?.findColumnByName('checkout_fingerprint');
    if (!checkoutKey || !checkoutFingerprint) throw new Error('Checkout idempotency columns were not created.');
    if (checkoutKey.isNullable) {
      const requiredCheckoutKey = checkoutKey.clone();
      requiredCheckoutKey.isNullable = false;
      await queryRunner.changeColumn('tbl_invoice', checkoutKey, requiredCheckoutKey);
    }
    const refreshed = await queryRunner.getTable('tbl_invoice');
    const refreshedFingerprint = refreshed?.findColumnByName('checkout_fingerprint');
    if (refreshedFingerprint?.isNullable) {
      const requiredFingerprint = refreshedFingerprint.clone();
      requiredFingerprint.isNullable = false;
      await queryRunner.changeColumn('tbl_invoice', refreshedFingerprint, requiredFingerprint);
    }
    const indexed = await queryRunner.getTable('tbl_invoice');
    if (!indexed?.indices.some((index) => index.name === 'uq_invoice_tenant_checkout')) {
      await queryRunner.createIndex('tbl_invoice', new TableIndex({ name: 'uq_invoice_tenant_checkout', columnNames: ['tenant_id', 'checkout_key'], isUnique: true }));
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('tbl_invoice');
    if (!table) return;
    if (table.indices.some((index) => index.name === 'uq_invoice_tenant_checkout')) await queryRunner.dropIndex(table, 'uq_invoice_tenant_checkout');
    if (await queryRunner.hasColumn('tbl_invoice', 'checkout_fingerprint')) await queryRunner.dropColumn('tbl_invoice', 'checkout_fingerprint');
    if (await queryRunner.hasColumn('tbl_invoice', 'checkout_key')) await queryRunner.dropColumn('tbl_invoice', 'checkout_key');
  }
}
