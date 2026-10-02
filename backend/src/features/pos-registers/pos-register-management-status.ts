import { PosCashReconciliationStatus, PosCashReconciliationType } from './pos-cash-reconciliation.entity';
import { PosCashierSessionStatus } from './pos-cashier-session.entity';
import { PosRegisterMode } from './pos-location-config.entity';
import { PosRegisterSessionStatus } from './pos-register-session.entity';

export type PosManagementAction =
  | 'OPEN_REGISTER'
  | 'START_CASHIER_SESSION'
  | 'RESUME_BILLING'
  | 'SIGN_OFF'
  | 'AWAIT_VERIFICATION'
  | 'SUBMIT_RECOUNT'
  | 'VIEW_HISTORY'
  | 'AVAILABLE';

export function registerNextAction(status: PosRegisterSessionStatus | null): PosManagementAction {
  if (!status || status === PosRegisterSessionStatus.CLOSED) return 'OPEN_REGISTER';
  if (status === PosRegisterSessionStatus.PENDING_VERIFICATION) return 'AWAIT_VERIFICATION';
  if (status === PosRegisterSessionStatus.RECOUNT_REQUIRED) return 'SUBMIT_RECOUNT';
  return 'VIEW_HISTORY';
}

export function cashierNextAction(
  status: PosCashierSessionStatus,
  mode: PosRegisterMode,
  reconciliation?: { status: PosCashReconciliationStatus; reconciliationType: PosCashReconciliationType } | null,
): PosManagementAction {
  if (status === PosCashierSessionStatus.ACTIVE) return 'SIGN_OFF';
  if (status === PosCashierSessionStatus.PENDING_VERIFICATION) return 'AWAIT_VERIFICATION';
  if (status === PosCashierSessionStatus.RECOUNT_REQUIRED) return 'SUBMIT_RECOUNT';
  if (reconciliation?.status === PosCashReconciliationStatus.REJECTED) return 'SUBMIT_RECOUNT';
  return mode === PosRegisterMode.MASTER_REGISTER ? 'AVAILABLE' : 'VIEW_HISTORY';
}
