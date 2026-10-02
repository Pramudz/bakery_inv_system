import { SetMetadata } from '@nestjs/common';
export const REQUIRE_PERMISSION = 'require_permission';
export const REQUIRE_ANY_PERMISSION = 'require_any_permission';
export const RequirePermission = (...codes: string[]) =>
  SetMetadata(REQUIRE_PERMISSION, codes.length === 1 ? codes[0] : codes);
export const RequireAnyPermission = (...codes: string[]) =>
  SetMetadata(REQUIRE_ANY_PERMISSION, codes);
