import assert from 'node:assert/strict';
import test from 'node:test';
import { PosCashReconciliationStatus, PosCashReconciliationType } from './pos-cash-reconciliation.entity';
import { PosCashierSessionStatus } from './pos-cashier-session.entity';
import { PosRegisterMode } from './pos-location-config.entity';
import { cashierNextAction, registerNextAction } from './pos-register-management-status';
import { PosRegisterSessionStatus } from './pos-register-session.entity';

test('register management actions map the actual register states without reopening frozen sessions', () => {
  assert.equal(registerNextAction(null), 'OPEN_REGISTER');
  assert.equal(registerNextAction(PosRegisterSessionStatus.OPEN), 'VIEW_HISTORY');
  assert.equal(registerNextAction(PosRegisterSessionStatus.PENDING_VERIFICATION), 'AWAIT_VERIFICATION');
  assert.equal(registerNextAction(PosRegisterSessionStatus.RECOUNT_REQUIRED), 'SUBMIT_RECOUNT');
  assert.equal(registerNextAction(PosRegisterSessionStatus.CLOSED), 'OPEN_REGISTER');
});

test('cashier action mapping preserves active, pending, rejected-recount and ended master behavior', () => {
  assert.equal(cashierNextAction(PosCashierSessionStatus.ACTIVE, PosRegisterMode.TERMINAL_REGISTER), 'SIGN_OFF');
  assert.equal(cashierNextAction(PosCashierSessionStatus.PENDING_VERIFICATION, PosRegisterMode.MASTER_REGISTER), 'AWAIT_VERIFICATION');
  assert.equal(cashierNextAction(PosCashierSessionStatus.RECOUNT_REQUIRED, PosRegisterMode.TERMINAL_REGISTER, {
    status: PosCashReconciliationStatus.REJECTED,
    reconciliationType: PosCashReconciliationType.TERMINAL_CASH_COUNT,
  }), 'SUBMIT_RECOUNT');
  assert.equal(cashierNextAction(PosCashierSessionStatus.ENDED, PosRegisterMode.MASTER_REGISTER), 'AVAILABLE');
  assert.equal(cashierNextAction(PosCashierSessionStatus.ENDED, PosRegisterMode.TERMINAL_REGISTER), 'VIEW_HISTORY');
});
