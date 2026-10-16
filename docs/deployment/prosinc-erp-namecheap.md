# Prosinc ERP: one release for multiple Namecheap environments

The same archive is installed in each customer's private cPanel Node.js application root. Customer identity, database credentials, and runtime settings come from that application's environment, not from a customer-specific build. `server.js` keeps the working directory at the application root so runtime `uploads/` stays there. Nest serves `/api/*`; the compiled React app and its deep-link fallback use `frontend/dist`. Keep the application root outside `public_html` and set cPanel's startup file to `server.js`.

## Release packaging

Use a reviewed, clean commit. The package command always rebuilds backend and frontend and refuses uncommitted release inputs. `--allow-dirty` and the ZIP script's `-AllowDirty` switch exist solely to validate packaging before a commit; those archives carry `-dirty` in the name and must not be deployed.

```powershell
cd backend; npm ci; npm test; cd ..
cd frontend; npm ci; npm test; cd ..
node scripts/package-deployment.cjs
powershell -File scripts/zip-deployment.ps1
```

The archive is `build/prosinc-erp-VERSION-COMMIT.zip`. It extracts directly into the app root (no wrapper directory). It contains `server.js`, production `package.json` and lockfile, `backend/dist`, `frontend/dist`, the baseline SQL, `scripts/db-check.cjs`, `scripts/initialize-platform.cjs`, this guide, and `release.json` with SHA-256 hashes and the full Git commit. ZIP creation checks hashes and reads every entry back. The package uses an allowlist and contains no `.env`, `node_modules`, logs, uploads, credentials, or database dump. The only SQL file is the versioned, empty-database baseline schema.

Do not extract into a location where an archive tool will delete or replace existing files outside its entries. Preserve `uploads/`, cPanel environment variables, logs, backups, and any local runtime files separately. Install dependencies with `npm ci --omit=dev` in the app root; check that native `bcrypt` loads under the cPanel Node version. Set `NODE_ENV=production`, `DB_TYPE=mysql` or `mariadb`, `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, and `DB_DATABASE` in cPanel. Do not set a customer-specific `VITE_API_URL`: production browser calls use same-origin `/api`. Do not enable schema synchronization.

## Database validation and compatibility

The checker reads only. It compares the actual `migrations` ledger, in order, with the migration classes compiled into this release; it rejects missing, changed, out-of-order, duplicated, or newer entries. It distinguishes an empty database, a compatible database with pending migrations, and a current database. It checks that the selected database matches `DB_DATABASE`, the server is MySQL 8+ or MariaDB 11.4+, the database uses `utf8mb4`, and collations required by the baseline are available. A successful collation check is **not** proof that every migration behaves identically on MySQL and MariaDB. Rehearse the exact release against a disposable database of the same server family and version before production.

The cPanel application's environment may not be inherited by Terminal/SSH. Set the same `DB_*` values in that private shell without putting passwords in command history. Then run:

```bash
node scripts/db-check.cjs manifest
node scripts/db-check.cjs inspect
```

`inspect` reports `empty`, `upgrade` plus pending count, or `current`. Stop and investigate any failure. Do not edit the ledger by hand, run `migration:revert`/`--fake`, or replay migrations after a partial DDL failure.

## Fresh installation

1. Create an empty customer database and database user in cPanel. Keep the Node app stopped. Confirm the selected target with `node scripts/db-check.cjs empty`.
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

## Hosting gates

This repository cannot verify the customer's cPanel Node runtime, Passenger routing, filesystem permissions, installed native modules, database server behavior, backup restoration, or live transaction smoke tests locally. Verify these on the target host and on a representative disposable database before production use. The runtime package remains single-origin; no source edit or customer-specific frontend build is required.
