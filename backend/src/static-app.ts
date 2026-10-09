import { join } from 'node:path';
import type { ServeStaticModuleOptions } from '@nestjs/serve-static';

// __dirname is backend/dist after compilation. The deployment package places
// frontend/dist beside backend/dist under the application root.
export const frontendDistPath = join(__dirname, '..', '..', 'frontend', 'dist');

export const staticAppOptions: ServeStaticModuleOptions = {
  rootPath: frontendDistPath,
  exclude: ['/api', '/api/{*path}', '/assets/{*path}'],
};
