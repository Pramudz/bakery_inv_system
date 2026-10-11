import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class TenantWideInvoiceCollectionKeys1770000047000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const orphan = await runner.query(`SELECT p.invoice_payment_id FROM tbl_invoice_payment p
      LEFT JOIN tbl_invoice i ON i.invoice_id = p.invoice_id WHERE i.invoice_id IS NULL LIMIT 1`);
    if (orphan.length) throw new Error('Invoice payment without an owning invoice; resolve before adding tenant-wide collection uniqueness.');
    const duplicates = await runner.query(`SELECT i.tenant_id, p.collection_key FROM tbl_invoice_payment p
      INNER JOIN tbl_invoice i ON i.invoice_id = p.invoice_id WHERE p.collection_key IS NOT NULL
      GROUP BY i.tenant_id, p.collection_key HAVING COUNT(*) > 1 LIMIT 1`);
    if (duplicates.length) throw new Error('Duplicate tenant collection keys exist; review financial history before migrating.');

    if (!(await runner.hasColumn('tbl_invoice_payment', 'tenant_id'))) {
      await runner.addColumn('tbl_invoice_payment', new TableColumn({ name: 'tenant_id', type: 'bigint', isNullable: true }));
    }
    await runner.query(`UPDATE tbl_invoice_payment p INNER JOIN tbl_invoice i ON i.invoice_id = p.invoice_id
      SET p.tenant_id = i.tenant_id WHERE p.tenant_id IS NULL`);
    const inconsistent = await runner.query(`SELECT p.invoice_payment_id FROM tbl_invoice_payment p
      INNER JOIN tbl_invoice i ON i.invoice_id = p.invoice_id
      WHERE p.tenant_id IS NULL OR p.tenant_id <> i.tenant_id LIMIT 1`);
    if (inconsistent.length) throw new Error('Invoice payment tenant attribution does not match its invoice.');
    await runner.query('ALTER TABLE tbl_invoice_payment MODIFY tenant_id BIGINT NOT NULL');

    const table = await runner.getTable('tbl_invoice_payment');
    if (!table?.indices.some((index) => index.name === 'uq_invoice_payment_tenant_collection')) {
      await runner.createIndex('tbl_invoice_payment', new TableIndex({
        name: 'uq_invoice_payment_tenant_collection', columnNames: ['tenant_id', 'collection_key'], isUnique: true,
      }));
    }
    if (!table?.foreignKeys.some((key) => key.name === 'fk_invoice_payment_tenant')) {
      await runner.createForeignKey('tbl_invoice_payment', new TableForeignKey({
        name: 'fk_invoice_payment_tenant', columnNames: ['tenant_id'], referencedTableName: 'tbl_tenant',
        referencedColumnNames: ['tenant_id'], onDelete: 'RESTRICT',
      }));
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.dropForeignKey('tbl_invoice_payment', 'fk_invoice_payment_tenant');
    await runner.dropIndex('tbl_invoice_payment', 'uq_invoice_payment_tenant_collection');
    await runner.dropColumn('tbl_invoice_payment', 'tenant_id');
  }
}
