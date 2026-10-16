# Prosinc ERP: one release for multiple Namecheap environments

The same archive is installed in each customer's private cPanel Node.js application root. Customer identity, database credentials, and runtime settings come from that application's environment, not from a customer-specific build. `server.js` keeps the working directory at the application root so runtime `uploads/` stays there. Nest serves `/api/*`; the compiled React app and its deep-link fallback use `frontend/dist`. Keep the application root outside `public_html` and set cPanel's startup file to `server.js`.

## Release packaging

Use a reviewed, clean commit. The package command always rebuilds backend and frontend and refuses uncommitted release inputs. `--allow-dirty` and the ZIP script's `-AllowDirty` switch exist solely to validate packaging before a commit; those archives carry `-dirty` in the name and must not be deployed. `node scripts/package-deployment.cjs --allow-dirty --validate-only` checks all staged release files without replacing an existing local package.

```powershell
cd backend; npm ci; npm test; cd ..
cd frontend; npm ci; npm test; cd ..
node scripts/package-deployment.cjs
powershell -File scripts/zip-deployment.ps1
```

The archive is `build/prosinc-erp-VERSION-COMMIT.zip`. It extracts directly into the app root (no wrapper directory). It contains `server.js`, production `package.json` and lockfile, `backend/dist`, `frontend/dist`, the baseline SQL, `scripts/db-check.cjs`, `scripts/initialize-platform.cjs`, this guide, and `release.json` with SHA-256 hashes and the full Git commit. ZIP creation checks hashes and reads every entry back. The package uses an allowlist and contains no `.env`, `node_modules`, logs, uploads, credentials, or database dump. The only SQL file is the versioned, empty-database baseline schema.

Do not extract into a location where an archive tool will delete or replace existing files outside its entries. Preserve `uploads/`, cPanel environment variables, logs, backups, and any local runtime files separately. Install dependencies with `npm ci --omit=dev` in the app root; check that native `bcrypt` loads under the cPanel Node version. Set `NODE_ENV=production`, `DB_TYPE=mysql` or `mariadb`, `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, and `DB_DATABASE` in cPanel. Do not set a customer-specific `VITE_API_URL`: production browser calls use same-origin `/api`. Do not enable schema synchronization.

## Database validation and compatibility

The checker reads only. It compares the actual `migrations` ledger, in order, with the migration classes compiled into this release; it rejects missing, changed, out-of-order, duplicated, or newer entries. It distinguishes an empty database, a compatible database with pending migrations, and a current database. It checks the selected database, MySQL 8+ or MariaDB 11.4.5+, exact database defaults (`utf8mb4` / `utf8mb4_0900_ai_ci`), actual collation availability and a comparison probe, and the charset/collation of every existing table and character column. `inspect` and `current` never alter the database. Release packaging and backend tests run a source guard covering baseline, raw SQL migration creation, and TypeORM `Table` creation.

MariaDB 11.4.5+ exposes `utf8mb4_0900_ai_ci` as an alias for its UCA 14 collation; MySQL 8 uses its native 0900 collation. The shared name does not prove identical ordering or uniqueness for all Unicode strings. Rehearse migration DDL and application behavior on both target server families. Stop if the server lacks the named collation or a business key/index comparison differs.

The cPanel application's environment may not be inherited by Terminal/SSH. Set the same `DB_*` values in that private shell without putting passwords in command history. Then run:

```bash
node scripts/db-check.cjs manifest
node scripts/db-check.cjs inspect
```

`inspect` reports `empty`, `upgrade` plus pending count, or `current`. Stop and investigate any failure. Do not edit the ledger by hand, run `migration:revert`/`--fake`, or replay migrations after a partial DDL failure.

## Fresh installation

1. Confirm `SHOW COLLATION LIKE 'utf8mb4_0900_ai_ci'` returns the exact collation with charset `utf8mb4`, and test a comparison using that collation. Create an empty customer database and user in cPanel with **DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_0900_ai_ci**. If cPanel cannot select these defaults, stop and have the database administrator create the database correctly. Keep the Node app stopped. Confirm `SELECT DATABASE(), VERSION()` and `SHOW CREATE DATABASE` identify the intended empty database and both required defaults. Run `node scripts/db-check.cjs empty`; a database with `latin1` defaults must be rejected before baseline import.
2. Import the packaged `schema/baseline-*.sql` **once** into that empty database via phpMyAdmin or a database client. It creates initial schema and migration history; it contains no tenant or user data. Do not use the older `backend/scripts/bootstrap-database.cjs`, which creates a database.
3. Run `node scripts/db-check.cjs inspect`. It must report pending migrations, with no history divergence. Rehearse on an equivalent disposable database first, then run `node node_modules/typeorm/cli.js migration:run -d backend/dist/data-source.js --transaction none`. MariaDB/MySQL DDL may implicitly commit. Run `node scripts/db-check.cjs current`; it must report no pending migrations.
4. Set `INIT_DB_CONFIRM` to the **exact** value of `DB_DATABASE`. Set `INIT_PLATFORM_USERNAME` and a strong `INIT_PLATFORM_PASSWORD` in the private shell; prompt for the password rather than typing it in a command. Run `node scripts/db-check.cjs init-ready`, then `node scripts/initialize-platform.cjs` **once**. It refuses any existing platform administrator, tenant, or tenant user and never resets a password. Unset the `INIT_*` variables afterward.
5. Start/restart the cPanel Node app. Sign in at `/login` and create tenants in Platform Administration. The ordinary tenant landing page is `/tenant-login`.

The initialization script opens an offline Nest application context to seed the global authorization catalog and calls the existing first-administrator bootstrap. It creates no tenant. Never add it to a startup hook, package script, or normal upgrade sequence.

## Existing installation upgrade

1. Schedule a maintenance window and stop writes. Record current release metadata and cPanel environment settings securely. Export a full database backup **including schema, data, and `migrations`**; copy `uploads/` to protected storage. Restore both to a separate test environment and rehearse this exact release there. Verify restore and sample transaction data before proceeding.
2. Stage the new archive in a separate private directory. Compare `release.json` to the intended version/commit and run `npm ci --omit=dev` there. In that directory, use the same `DB_*` environment as the live app and run `node scripts/db-check.cjs inspect` against the existing database. If history diverges, stop; do not initialize or overwrite data.
3. Keep the application stopped. Replace only release-owned files from the archive in the cPanel application root; preserve `uploads/`, runtime settings, and other customer data. Run `npm ci --omit=dev`. For pending migrations, run the reviewed `typeorm migration:run -d backend/dist/data-source.js --transaction none` command and then `node scripts/db-check.cjs current`. Run **no** baseline import and **no** platform initialization on an existing installation.
4. Restart through cPanel. Verify `/`, a refreshed deep React route, tenant and platform login, authorization, and an `/api/*` route. An unknown API route must not return SPA HTML; a missing `/assets/*` file must return 404. Check a representative tenant's data, upload access, and application logs before reopening writes.

For rollback before migrations, restore the previous release-owned files and restart. After migrations, code-only rollback is safe only if the previous release is compatible with the new schema. Otherwise stop writes and restore the matching **database backup, uploads backup, and prior application release together** into a recovery environment, reconcile any transactions after the backup, and switch traffic only after verification. Never overwrite newer customer transactions with an older backup without reconciliation. Keep the app stopped after a failed or partial migration until the state is reviewed.

## Existing databases with wrong defaults or mixed collations

Changing migration source affects only tables created in the future. It does not convert existing tables or update the migration ledger. `db-check` intentionally refuses an existing database with a wrong default or any mismatched table. Do not run the baseline, rerun old migrations, fake ledger entries, or blindly mass-convert customer tables. For a live customer, first inventory every table, column, foreign key, index, stored routine and view, and test collation-dependent uniqueness/order behavior. Take and restore a full backup on an equivalent staging server. Plan a separate, approved maintenance procedure that changes the database default and converts only reviewed tables in dependency order, with downtime and rollback plan; validate data and all table/column collations afterward. MySQL/MariaDB DDL may commit implicitly. No such conversion is part of this release.

## TIFOAM testing installation: manual clean rebuild plan (approval required later)

This applies **only** to `prosnbvs_erp_tifoam` on the identified Namecheap MariaDB 11.4.13 testing host. It deletes that testing database when executed later; no command in this section runs automatically. Do not use this plan for another customer or any production database.

1. Stop the TIFOAM test application and all writers. Independently confirm the hosting account, hostname, database username, server version, selected database, and purpose. From the intended connection run `SELECT DATABASE(), VERSION()` and verify the database is **exactly** `prosnbvs_erp_tifoam` and the server is the intended MariaDB 11.4.13 host. Record `SHOW CREATE DATABASE`, table inventory, row counts, and the existing ordered `migrations` ledger (expected currently: 44 applied). Abort on any mismatch.
2. Export a full backup including schema, data, migration ledger, and routines/triggers where present. Back up uploads and runtime configuration separately. Restore the SQL backup to a **separate disposable database** and verify representative records and the ledger. Obtain explicit owner approval to discard the TIFOAM test database. Record the backup location and restore instructions before any drop.
3. A DBA, using a connection bound to the positively identified test host and account, manually drops **only** the exact `prosnbvs_erp_tifoam` database and recreates that same name with `CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`. Verify `SHOW COLLATION LIKE 'utf8mb4_0900_ai_ci'` and a real comparison on this MariaDB server before recreation. Never use a wildcard or a script that constructs the database name. Recheck `SELECT DATABASE(), VERSION()`, `SHOW CREATE DATABASE`, and `node scripts/db-check.cjs empty` before import; stop if the default or target differs.
4. With this exact reviewed release package, import its `schema/baseline-1770000023000.sql` **once**. Run `node scripts/db-check.cjs inspect`: the baseline must have 24 genuine migration entries, with exactly 27 of this release's 51 compiled migrations pending. Stop on any other count, history divergence, or table mismatch.
5. Run the normal migration runner once (`node node_modules/typeorm/cli.js migration:run -d backend/dist/data-source.js --transaction none`). If any migration fails, stop and investigate the partial DDL; never use `--fake`, `migration:revert`, or manual ledger inserts. Run `node scripts/db-check.cjs current`; verify 51 ordered applied migrations, zero pending, database defaults and every table at `utf8mb4` / `utf8mb4_0900_ai_ci` through `information_schema`.
6. Set `INIT_DB_CONFIRM` to the exact database name, provide a new strong platform administrator password privately, run `node scripts/db-check.cjs init-ready`, then `node scripts/initialize-platform.cjs` **once**. Remove initialization secrets from the shell. Start the test app and verify platform login, tenant creation, API/SPA routes, and representative workflows. If validation fails, leave the app stopped and restore from the verified backup according to the recorded plan.

## Hosting gates

This repository cannot verify the customer's cPanel Node runtime, Passenger routing, filesystem permissions, installed native modules, database server behavior, backup restoration, or live transaction smoke tests locally. Verify these on the target host and on a representative disposable database before production use. The runtime package remains single-origin; no source edit or customer-specific frontend build is required.
