import { ForbiddenException } from '@nestjs/common';

export function assertDevelopmentBootstrapEnabled(): void {
  if (process.env.NODE_ENV !== 'development' || process.env.ENABLE_HTTP_BOOTSTRAP !== 'true') {
    throw new ForbiddenException('HTTP administrator bootstrap is disabled. Use offline initialization.');
  }
}
