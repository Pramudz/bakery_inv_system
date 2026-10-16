// Static release gate for every fresh-install CREATE TABLE path. No database access.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../backend/node_modules/typescript');

const migrationDir = path.resolve(__dirname, '../backend/src/migrations');
const baselineDir = path.resolve(__dirname, '../backend/schema');
const tableOptions = /\)\s*ENGINE\s*=\s*InnoDB\s+DEFAULT\s+CHARSET\s*=\s*utf8mb4\s+COLLATE\s*=\s*utf8mb4_0900_ai_ci\s*;?\s*$/i;
const typeormEngine = 'InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci';

function inspectMigration(source, filename = 'migration.ts') {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (tree.parseDiagnostics.length) throw new Error(`${filename}: TypeScript parse error`);
  const errors = [];
  let rawTables = 0;
  let typeormTables = 0;
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      const sql = ts.isTemplateExpression(node) ? node.head.text : node.text;
      if (/\bCREATE\s+TABLE\b/i.test(sql)) {
        rawTables++;
        if (ts.isTemplateExpression(node) || !tableOptions.test(sql)) {
          errors.push(`${filename}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1}: raw CREATE TABLE must end with ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
        }
      }
    }
    if (ts.isNewExpression(node) && node.expression.getText(tree) === 'Table') {
      typeormTables++;
      const options = node.arguments?.[0];
      const engine = options && ts.isObjectLiteralExpression(options) && options.properties.find(property =>
        ts.isPropertyAssignment(property) && property.name.getText(tree).replace(/^['"]|['"]$/g, '') === 'engine');
      if (!engine || !ts.isStringLiteral(engine.initializer) || engine.initializer.text !== typeormEngine) {
        errors.push(`${filename}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1}: TypeORM Table requires engine: '${typeormEngine}'`);
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'createTable' &&
        !node.arguments.some(arg => ts.isNewExpression(arg) && arg.expression.getText(tree) === 'Table')) {
      errors.push(`${filename}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1}: createTable must use an explicit new Table with checked engine options`);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'query') {
      const sql = node.arguments[0];
      if (sql && !ts.isStringLiteral(sql) && !ts.isNoSubstitutionTemplateLiteral(sql)) {
        const templateText = ts.isTemplateExpression(sql) ?
          [sql.head.text, ...sql.templateSpans.map(span => span.literal.text)].join(' ') : '';
        if (!ts.isTemplateExpression(sql) || /^\s*CREATE\b/i.test(templateText)) {
          errors.push(`${filename}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1}: dynamic SQL query could hide a CREATE TABLE; use a static, checked CREATE TABLE statement`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return { rawTables, typeormTables, errors };
}

function inspectBaseline(sql, filename = 'baseline.sql') {
  const statements = sql.split(';').filter(part => /\bCREATE\s+TABLE\b/i.test(part));
  const errors = statements.flatMap((statement, index) => tableOptions.test(statement) ? [] :
    [`${filename}: CREATE TABLE statement ${index + 1} lacks the required explicit charset/collation`]);
  return { tables: statements.length, errors };
}

function checkRelease(options = {}) {
  const sourceDir = options.migrationDir || migrationDir;
  const schemaDir = options.baselineDir || baselineDir;
  const files = fs.readdirSync(sourceDir).filter(name => /^\d{13}-.+\.ts$/.test(name)).sort();
  const baselines = fs.readdirSync(schemaDir).filter(name => /^baseline-\d+\.sql$/.test(name));
  if (!files.length || baselines.length !== 1) throw new Error('Migration source or unique baseline SQL is missing');
  const results = files.map(file => inspectMigration(fs.readFileSync(path.join(sourceDir, file), 'utf8'), file));
  const baseline = inspectBaseline(fs.readFileSync(path.join(schemaDir, baselines[0]), 'utf8'), baselines[0]);
  const errors = [...baseline.errors, ...results.flatMap(result => result.errors)];
  const rawTables = results.reduce((sum, result) => sum + result.rawTables, 0);
  const typeormTables = results.reduce((sum, result) => sum + result.typeormTables, 0);
  if (!baseline.tables || !rawTables || !typeormTables) errors.push('Expected baseline, raw SQL and TypeORM table definitions were not found');
  if (errors.length) throw new Error(`Migration collation guard failed:\n${errors.join('\n')}`);
  return { migrations: files.length, baselineTables: baseline.tables, rawTables, typeormTables };
}

if (require.main === module) {
  try { console.log('Migration collation guard:', checkRelease()); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { inspectMigration, inspectBaseline, checkRelease };
