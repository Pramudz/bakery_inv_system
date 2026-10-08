import 'dotenv/config';
import { DataSource } from 'typeorm';
import { databaseType } from './database-type';

export default new DataSource({
  type: databaseType(process.env.DB_TYPE),
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [__dirname + '/**/*.entity{.js,.ts}'],
  migrations: [__dirname + '/migrations/*{.js,.ts}'],
  synchronize: false,
});
