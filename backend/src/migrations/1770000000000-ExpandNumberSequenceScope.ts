import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class ExpandNumberSequenceScope1770000000000 implements MigrationInterface {
  name = 'ExpandNumberSequenceScope1770000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    let sequenceTable = await queryRunner.getTable('tbl_number_sequence');
    if (!sequenceTable) throw new Error('tbl_number_sequence does not exist');

    if (!sequenceTable.findColumnByName('scope_key')) {
      await queryRunner.query(`ALTER TABLE tbl_number_sequence ADD COLUMN scope_key varchar(100) NOT NULL DEFAULT 'TENANT' AFTER sequence_key`);
    }
    if (!sequenceTable.findColumnByName('period_key')) {
      await queryRunner.query(`ALTER TABLE tbl_number_sequence ADD COLUMN period_key varchar(20) NOT NULL DEFAULT 'NEVER' AFTER scope_key`);
    }

    sequenceTable = (await queryRunner.getTable('tbl_number_sequence'))!;
    const oldUniqueIndex = sequenceTable.indices.find(
      (index) =>
        index.isUnique &&
        index.columnNames.length === 2 &&
        index.columnNames.includes('tenant_id') &&
        index.columnNames.includes('sequence_key'),
    );
    if (oldUniqueIndex) await queryRunner.dropIndex(sequenceTable, oldUniqueIndex);

    const scopedUniqueIndex = sequenceTable.indices.find(
      (index) => index.name === 'uq_number_sequence_scope',
    );
    if (!scopedUniqueIndex) {
      await queryRunner.createIndex(
        sequenceTable,
        new TableIndex({
          name: 'uq_number_sequence_scope',
          isUnique: true,
          columnNames: ['tenant_id', 'sequence_key', 'scope_key', 'period_key'],
        }),
      );
    }

    const goodsReceiptTable = await queryRunner.getTable('tbl_goods_receipt');
    const grnNumber = goodsReceiptTable?.findColumnByName('grn_number');
    if (grnNumber && !grnNumber.isNullable) {
      await queryRunner.query(`ALTER TABLE tbl_goods_receipt MODIFY COLUMN grn_number varchar(50) NULL`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tbl_goods_receipt
        MODIFY COLUMN grn_number varchar(50) NOT NULL
    `);
    const sequenceTable = await queryRunner.getTable('tbl_number_sequence');
    const scopedIndex = sequenceTable?.indices.find((index) => index.name === 'uq_number_sequence_scope');
    if (sequenceTable && scopedIndex) await queryRunner.dropIndex(sequenceTable, scopedIndex);
    await queryRunner.query(`ALTER TABLE tbl_number_sequence DROP COLUMN period_key, DROP COLUMN scope_key`);
    await queryRunner.createIndex(
      'tbl_number_sequence',
      new TableIndex({
        name: 'uq_number_sequence_tenant_sequence_key',
        isUnique: true,
        columnNames: ['tenant_id', 'sequence_key'],
      }),
    );
  }
}
