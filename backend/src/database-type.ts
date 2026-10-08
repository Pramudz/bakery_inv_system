export type DatabaseType = 'mysql' | 'mariadb';

export function databaseType(value: string | undefined): DatabaseType {
  const type = value || 'mysql';
  if (type !== 'mysql' && type !== 'mariadb') {
    throw new Error('DB_TYPE must be mysql or mariadb');
  }
  return type;
}
