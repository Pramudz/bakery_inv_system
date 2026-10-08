import { BadRequestException } from '@nestjs/common';

// bcrypt only uses the first 72 bytes. Reject longer passwords instead of silently truncating them.
export function assertStrongInitialAdminPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 12 || Buffer.byteLength(value, 'utf8') > 72 ||
      !/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    throw new BadRequestException('Initial administrator password must be at least 12 characters, at most 72 UTF-8 bytes, and include uppercase, lowercase, number, and symbol.');
  }
  return value;
}
