export type PasswordChange = { currentPassword: string; newPassword: string; confirmPassword: string };

export function validatePasswordChange(values: PasswordChange): string {
  if (!values.currentPassword) return 'Enter your current password.';
  if (values.newPassword.length < 12) return 'Use at least 12 characters for your new password.';
  if (new TextEncoder().encode(values.newPassword).length > 72) return 'New password must be at most 72 UTF-8 bytes. Try a shorter password.';
  if (!/[a-z]/.test(values.newPassword) || !/[A-Z]/.test(values.newPassword) ||
      !/[0-9]/.test(values.newPassword) || !/[^A-Za-z0-9]/.test(values.newPassword)) {
    return 'Include uppercase, lowercase, a number, and a symbol.';
  }
  if (values.newPassword !== values.confirmPassword) return 'New passwords do not match.';
  if (values.currentPassword === values.newPassword) return 'Choose a password different from your current password.';
  return '';
}
