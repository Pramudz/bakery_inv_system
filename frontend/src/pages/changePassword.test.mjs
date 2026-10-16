import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePasswordChange } from '../features/auth/passwordChange.ts';

test('password form accepts strong matching passwords and rejects unsafe submissions', () => {
  const valid = { currentPassword: 'PreviousPass123!', newPassword: 'UpdatedPass456!', confirmPassword: 'UpdatedPass456!' };
  assert.equal(validatePasswordChange(valid), '');
  assert.match(validatePasswordChange({ ...valid, currentPassword: '' }), /current password/i);
  assert.match(validatePasswordChange({ ...valid, newPassword: 'short' }), /12 characters/i);
  assert.match(validatePasswordChange({ ...valid, newPassword: 'longlowercaseonly' }), /uppercase/i);
  assert.match(validatePasswordChange({ ...valid, confirmPassword: 'OtherPass123!' }), /do not match/i);
  assert.match(validatePasswordChange({ ...valid, currentPassword: valid.newPassword }), /different/i);
  assert.match(validatePasswordChange({ ...valid, newPassword: 'Aa1!' + 'é'.repeat(40) }), /72/i);
});
