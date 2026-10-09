# Initialize the empty Tifoam TEST database

**Target only:** `prosnbvs_erp_tifoam` on `11.4.13-MariaDB-cll-lve-log`. These are instructions for the hosting operator; the repository preparation did not connect to a database or run SQL. Keep the Node application stopped until the final verification succeeds. The test database may be recreated if any step fails.

## Files and audit

The updated deployment package contains:

```text
schema/baseline-1770000023000.sql
backend/dist/data-source.js
backend/dist/migrations/*.js
scripts/tifoam-db-check.cjs
scripts/tifoam-initial-data.cjs
```

If the already uploaded `backend/dist` is this same release, upload just the `schema/` and `scripts/` files above into the private application root, preserving their paths. Otherwise replace the compiled release with the updated ZIP before starting, while preserving the existing `uploads/` directory. Run the `manifest` check below to catch an unmatched baseline or migration build.

The unchanged baseline creates **57 tables**, including TypeORM's `migrations` ledger, and records **24** applied migration names from `1770000000000` to `1770000023000`. It has no non-ledger `INSERT` statements. The compiled release has **44** migrations, so **20** must run after the baseline, ending at `1770000043000`. The local `manifest` check compares every baseline ledger name and timestamp to the compiled migrations.

The hosting server recognizes `utf8mb4_0900_ai_ci`. MariaDB 11.4 maps that name to a UCA 14 alias; acceptance of the name does not prove identical MySQL 8 sorting or uniqueness behavior. The baseline has 57 explicit collation clauses and stored generated columns. Later migrations add generated-column indexes, change enum definitions, create foreign keys and CHECK constraints, and change decimal/datetime columns. The steps below run those changes as an observable compatibility test on this **empty TEST** database. MariaDB DDL causes implicit commits; a failed import or migration can leave a partial schema despite TypeORM transaction settings. Recreate the test database after a failure instead of rerunning over the partial state.

The baseline contains no users or tenants. After schema migration, the offline initial-data script opens a Nest application context (which initializes the global module/permission catalog) and creates only the first Platform Administrator. It does not start an HTTP listener or create a tenant. The administrator then creates TIFOAM through the Platform Administration UI.

## 1. Prepare the shell and confirm the target

Stop the Node application in cPanel. Use cPanel Terminal or SSH for the TypeORM and initial-data steps. Namecheap shared-hosting SSH may need to be enabled first. Work in the private Node application root, **outside `public_html`**. The cPanel application's environment variables may not be inherited by an interactive shell, so set them for this shell session. Replace the placeholders with the values already configured for the app. Do not put passwords directly in commands or in shell history.

```bash
cd /home/YOUR_CPANEL_USER/YOUR_NODE_APP_ROOT
test -f server.js && test -f schema/baseline-1770000023000.sql
test -f backend/dist/data-source.js && test -f scripts/tifoam-db-check.cjs
export NODE_ENV=production DB_TYPE=mariadb DB_SYNCHRONIZE=false
export DB_DATABASE=prosnbvs_erp_tifoam INIT_DB_CONFIRM=prosnbvs_erp_tifoam
export DB_HOST=localhost DB_PORT=3306 DB_USERNAME='YOUR_ASSIGNED_DB_USER'
read -r -s -p 'DB password: ' DB_PASSWORD; echo; export DB_PASSWORD
node scripts/tifoam-db-check.cjs manifest
node scripts/tifoam-db-check.cjs empty
```

Use the actual `DB_HOST`, `DB_PORT`, and assigned `DB_USERNAME` from cPanel if they differ from the examples. The checker refuses another database name, a nonempty database, an unexpected server version, or a missing collation. It reports the server SQL mode for troubleshooting. Do not run the old `backend/scripts/bootstrap-database.cjs`: it issues `CREATE DATABASE`, which is unnecessary for a cPanel-created database and may lack privileges.

## 2. Import the baseline once

**phpMyAdmin option:** Open cPanel > phpMyAdmin, select **`prosnbvs_erp_tifoam`** in the left pane, then use **Import** to upload `schema/baseline-1770000023000.sql` from the package. Verify the selected database before importing. Do not import into the phpMyAdmin server home context. If any statement fails, use the recovery procedure below.

**SSH option:** From the same private app root, use the MariaDB client. `-p` alone prompts for the password; do not place it on the command line.

```bash
mariadb -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USERNAME" -p "$DB_DATABASE" < schema/baseline-1770000023000.sql
```

Then, in either case:

```bash
node scripts/tifoam-db-check.cjs baseline
```

The checker must report exactly 57 baseline tables and all 24 matching ledger entries. Stop if it fails. Never add or fake ledger entries manually.

## 3. Apply the 20 compiled migrations

This step requires cPanel Terminal/SSH and the installed runtime `node_modules`. phpMyAdmin can import the baseline, but it cannot run the repository's TypeScript/compiled TypeORM migration classes. Use the **same package version** whose baseline passed the manifest check.

```bash
node node_modules/typeorm/cli.js migration:show -d backend/dist/data-source.js
node node_modules/typeorm/cli.js migration:run -d backend/dist/data-source.js --transaction none
node scripts/tifoam-db-check.cjs migrated
node node_modules/typeorm/cli.js migration:show -d backend/dist/data-source.js
```

Before the run, TypeORM should show 24 applied and 20 pending migrations. After the run, all 44 must be applied with none pending. `--transaction none` avoids implying that MariaDB DDL can be rolled back as one unit. The checker compares **every** ledger timestamp and class name and checks representative post-baseline tables. If a command errors or the checker fails, stop and recreate the test database. Do not use `migration:revert`, `--fake`, schema synchronization, or an ad hoc replay over a partially changed schema.

## 4. Initialize the global catalog and first Platform Administrator offline

With the HTTP application still stopped, choose a strong Platform Administrator password of 12–72 UTF-8 bytes, including uppercase, lowercase, a number, and a symbol. Set it only for this shell session:

```bash
export INIT_PLATFORM_USERNAME='YOUR_PLATFORM_ADMIN_USERNAME'
read -r -s -p 'Platform administrator password: ' INIT_PLATFORM_PASSWORD; echo; export INIT_PLATFORM_PASSWORD
node scripts/tifoam-initial-data.cjs
unset INIT_PLATFORM_PASSWORD INIT_PLATFORM_USERNAME
node scripts/tifoam-db-check.cjs platform-ready
unset DB_PASSWORD INIT_DB_CONFIRM
```

The script rechecks the migrated ledger. On rerun with the same platform username and password, it verifies the existing administrator without creating another; different credentials require manual review. The `platform-ready` check requires one platform user, all ten global modules, required user/role permissions, and zero tenants.

## 5. Create and verify TIFOAM through Platform Administration

Start the cPanel Node app. Log in as Platform Administrator at `https://tifoam.prosincsoft.com/login`. The tenant list should be empty. Select **New tenant**, enter code `TIFOAM`, choose its business IANA time zone explicitly (`Asia/Colombo` is suggested), and choose a strong initial administrator password. Save. The tenant, administrator, role, role assignment, nine default module links, and nine adjustment reasons are created in one transaction. The API never returns the password.

In a private shell with the same database environment variables set as in step 1, run `node scripts/tifoam-db-check.cjs tenant-created` to verify the UI creation separately. Then sign in through tenant login with tenant code `TIFOAM`, username `Admin`, and the password chosen in the UI. Configure business-specific reference records, payment methods, locations, and POS settings afterward.

## Recovery by recreating this TEST database

1. Keep the Node app stopped. Record the failed command and error. Confirm that **only** `prosnbvs_erp_tifoam` is involved. If test data has been added since initialization, export it first if it must be retained.
2. In cPanel **Manage My Databases**, remove **`prosnbvs_erp_tifoam` only**, then recreate that exact database name. Reassign the existing database user with the necessary schema privileges. Use the cPanel UI, rather than a shell-built `DROP DATABASE` command. Check that the app's `DB_DATABASE` and assigned user still match.
3. Reopen a fresh shell session, set the variables above, run `node scripts/tifoam-db-check.cjs empty`, and repeat the baseline, migration, and initial-data sequence. Do not import a baseline into leftover tables, alter the `migrations` ledger by hand, or assume a failed DDL transaction rolled back.

If cPanel does not permit database recreation or Terminal/SSH access, stop at the failed step and request those capabilities from hosting support. A phpMyAdmin-only path for the 20 TypeORM migrations would require a separately generated **and verified MariaDB 11.4 SQL snapshot** from a matching disposable database; this repository does not contain one.

## References

- [Namecheap: phpMyAdmin import and database selection](https://www.namecheap.com/support/knowledgebase/article.aspx/9540/2180/how-to-manage-databases-with-phpmyadmin/)
- [Namecheap: SSH import and password prompt](https://www.namecheap.com/support/knowledgebase/article.aspx/9184/2180/how-to-import-and-export-a-database-via-ssh/)
- [Namecheap: manage databases and user privileges](https://www.namecheap.com/support/knowledgebase/article.aspx/9363/2180/how-to-create-and-maintain-databases-in-cpanel/)
- [MariaDB: `utf8mb4_0900_ai_ci` alias](https://mariadb.com/docs/server/reference/data-types/string-data-types/character-sets/supported-character-sets-and-collations)
- [MariaDB: DDL implicit commits](https://mariadb.com/docs/server/reference/sql-statements/transactions/sql-statements-that-cause-an-implicit-commit)
- [TypeORM: migration transaction modes](https://typeorm.io/docs/migrations/setup/)
