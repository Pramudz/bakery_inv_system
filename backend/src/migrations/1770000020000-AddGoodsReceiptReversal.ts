import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from "typeorm";

export class AddGoodsReceiptReversal1770000020000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    // MySQL DDL is not transactional; column/index guards permit a safe retry.
    const add = async (
      table: string,
      options: NonNullable<ConstructorParameters<typeof TableColumn>[0]>,
    ) => {
      if (!(await runner.hasColumn(table, options.name)))
        await runner.addColumn(table, new TableColumn(options));
    };
    await add("tbl_goods_receipt", {
      name: "reversal_reason",
      type: "varchar",
      length: "1000",
      isNullable: true,
    });
    await add("tbl_goods_receipt", {
      name: "reversed_by_user_id",
      type: "bigint",
      isNullable: true,
    });
    await add("tbl_goods_receipt", {
      name: "reversed_at",
      type: "datetime",
      isNullable: true,
    });
    await add("tbl_inventory_ledger", {
      name: "valuation_method",
      type: "varchar",
      length: "40",
      isNullable: true,
    });
    for (const name of [
      "original_document_value",
      "inventory_relief_value",
      "cost_variance",
    ])
      await add("tbl_inventory_ledger", {
        name,
        type: "decimal",
        precision: 18,
        scale: 4,
        isNullable: true,
      });
    await add("tbl_inventory_ledger", {
      name: "reversal_of_ledger_id",
      type: "bigint",
      isNullable: true,
    });
    await add("tbl_inventory_ledger", {
      name: "business_date",
      type: "date",
      isNullable: true,
    });
    await add("tbl_inventory_ledger", {
      name: "age_layer_relief",
      type: "json",
      isNullable: true,
    });
    for (const [table, name, columns, unique] of [
      [
        "tbl_goods_receipt",
        "idx_grn_reversed_user",
        ["reversed_by_user_id"],
        false,
      ],
      [
        "tbl_inventory_ledger",
        "uq_inventory_ledger_reversal",
        ["reversal_of_ledger_id"],
        true,
      ],
    ] as const) {
      if (
        !(await runner.getTable(table))!.indices.some(
          (index) => index.name === name,
        )
      )
        await runner.createIndex(
          table,
          new TableIndex({ name, columnNames: [...columns], isUnique: unique }),
        );
    }
    for (const [table, name, column, target, targetColumn, onDelete] of [
      [
        "tbl_goods_receipt",
        "fk_grn_reversed_user",
        "reversed_by_user_id",
        "tbl_user",
        "user_id",
        "SET NULL",
      ],
      [
        "tbl_inventory_ledger",
        "fk_inventory_ledger_reversal",
        "reversal_of_ledger_id",
        "tbl_inventory_ledger",
        "inventory_ledger_id",
        "RESTRICT",
      ],
    ]) {
      if (
        !(await runner.getTable(table))!.foreignKeys.some(
          (key) => key.name === name,
        )
      )
        await runner.createForeignKey(
          table,
          new TableForeignKey({
            name,
            columnNames: [column],
            referencedTableName: target,
            referencedColumnNames: [targetColumn],
            onDelete,
          }),
        );
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    const [grns] = await runner.query(
      "SELECT COUNT(*) AS n FROM tbl_goods_receipt WHERE status = 'REVERSED' OR reversed_at IS NOT NULL OR reversal_reason IS NOT NULL OR reversed_by_user_id IS NOT NULL",
    );
    const [ledger] = await runner.query(
      "SELECT COUNT(*) AS n FROM tbl_inventory_ledger WHERE movement_type = 'GRN_REVERSAL' OR reversal_of_ledger_id IS NOT NULL OR valuation_method IS NOT NULL OR original_document_value IS NOT NULL OR inventory_relief_value IS NOT NULL OR cost_variance IS NOT NULL OR age_layer_relief IS NOT NULL OR business_date IS NOT NULL",
    );
    if (Number(grns.n) || Number(ledger.n))
      throw new Error(
        "Cannot roll back: reversal audit or valuation data exists. Keep the forward schema.",
      );
    await runner.dropForeignKey("tbl_goods_receipt", "fk_grn_reversed_user");
    await runner.dropForeignKey(
      "tbl_inventory_ledger",
      "fk_inventory_ledger_reversal",
    );
    await runner.dropIndex("tbl_goods_receipt", "idx_grn_reversed_user");
    await runner.dropIndex(
      "tbl_inventory_ledger",
      "uq_inventory_ledger_reversal",
    );
    for (const name of [
      "reversal_reason",
      "reversed_by_user_id",
      "reversed_at",
    ])
      await runner.dropColumn("tbl_goods_receipt", name);
    for (const name of [
      "valuation_method",
      "original_document_value",
      "inventory_relief_value",
      "cost_variance",
      "reversal_of_ledger_id",
      "business_date",
      "age_layer_relief",
    ])
      await runner.dropColumn("tbl_inventory_ledger", name);
  }
}
