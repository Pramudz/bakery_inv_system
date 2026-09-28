# Database baseline

`baseline-1770000023000.sql` is the schema-only, squashed representation of the development database after migration `1770000023000`. It contains no application data. The migration ledger entries are included because the baseline already contains the exact schema effects of migrations `1770000000000` through `1770000023000`; they are not placeholders for missing changes.

For a fresh database, keep `DB_SYNCHRONIZE=false`, set `DB_BASELINE_CONFIRM` to the exact value of `DB_DATABASE`, and run:

```sh
npm run db:bootstrap
```

The bootstrap command creates the named database if necessary, refuses any non-empty database, installs the baseline, verifies its cutoff, and then runs every later TypeORM migration.

For an existing database, never run the baseline command. Back up the database, review pending migrations, and use:

```sh
npm run migration:run
```

The existing development database is currently at cutoff `1770000023000`, so its upgrade path starts with `1770000024000`.
