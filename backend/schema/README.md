# Database baseline

`baseline-1770000023000.sql` is the schema-only, squashed representation of the development database after migration `1770000023000`. It contains no application data. The migration ledger entries are included because the baseline already contains the exact schema effects of migrations `1770000000000` through `1770000023000`; they are not placeholders for missing changes.

For a fresh database, first confirm the target server supports `utf8mb4_0900_ai_ci`, and create the database with **DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_0900_ai_ci**. If the database already exists, verify both defaults before importing the baseline. Never import into a database whose default is `latin1`, even though the baseline tables carry explicit options: later migrations and future tables must inherit a safe default. Keep `DB_SYNCHRONIZE=false`, set `DB_BASELINE_CONFIRM` to the exact value of `DB_DATABASE`, and run:

```sh
npm run db:bootstrap
```

The bootstrap command creates the named database with the required defaults if necessary, refuses a database with wrong defaults or any non-empty database, installs the baseline, verifies its cutoff, and then runs every later TypeORM migration. It does not repair an existing installation.

For an existing database, never run the baseline command. Back up the database, review pending migrations, and use:

```sh
npm run migration:run
```

The baseline's migration ledger ends at `1770000023000`; later migrations start at `1770000024000`. Historical migration DDL now supplies explicit table options. Installations where those migrations already ran retain their existing table collations until a separately reviewed maintenance operation; rerunning or editing the ledger will not repair them.
