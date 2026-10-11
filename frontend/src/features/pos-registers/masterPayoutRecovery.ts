/** One unresolved physical payout per authenticated operator. Never stores credentials. */
export type MasterPayoutIntent = {
  version: 1;
  tenantId: string;
  userId: string;
  kind: 'REFUND' | 'REVERSAL';
  sourceId: number;
  payload: {
    payoutKey: string;
    locationId: number;
    posRegisterSessionId: number;
    paymentMethodId?: number;
    amount: number;
    reason: string;
    physicalPayerIdentity: string;
  };
  createdAt: string;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const prefix = 'erp:master-payout-recovery:v1:';
const uuid4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const masterPayoutStorageKey = (tenantId: string | number, userId: string | number) => `${prefix}${tenantId}:${userId}`;

function valid(value: unknown, tenantId: string, userId: string): value is MasterPayoutIntent {
  if (!value || typeof value !== 'object') return false;
  const row = value as MasterPayoutIntent;
  const payload = row.payload;
  return row.version === 1 && row.tenantId === tenantId && row.userId === userId
    && (row.kind === 'REFUND' || row.kind === 'REVERSAL')
    && Number.isSafeInteger(row.sourceId) && row.sourceId > 0
    && !!payload && uuid4.test(payload.payoutKey)
    && Number.isSafeInteger(payload.locationId) && payload.locationId > 0
    && Number.isSafeInteger(payload.posRegisterSessionId) && payload.posRegisterSessionId > 0
    && (row.kind !== 'REFUND' || (Number.isSafeInteger(payload.paymentMethodId) && Number(payload.paymentMethodId) > 0))
    && Number.isFinite(payload.amount) && payload.amount > 0 && Math.round((payload.amount + Number.EPSILON) * 100) / 100 === payload.amount
    && typeof payload.reason === 'string' && !!payload.reason.trim()
    && typeof payload.physicalPayerIdentity === 'string' && !!payload.physicalPayerIdentity.trim()
    && typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt));
}

export function readMasterPayoutIntent(storage: StorageLike, tenantId: string | number, userId: string | number): MasterPayoutIntent | null {
  const raw = storage.getItem(masterPayoutStorageKey(tenantId, userId));
  if (raw === null) return null;
  try {
    const row: unknown = JSON.parse(raw);
    if (valid(row, String(tenantId), String(userId))) return row;
  } catch { /* Preserve malformed records for manual reconciliation. */ }
  throw new Error('Saved payout request is invalid. Check payout history before starting another payout.');
}

export function saveMasterPayoutIntent(storage: StorageLike, intent: MasterPayoutIntent) {
  if (!valid(intent, intent.tenantId, intent.userId)) throw new Error('The payout request is invalid and was not submitted.');
  const prior = readMasterPayoutIntent(storage, intent.tenantId, intent.userId);
  if (prior && (prior.payload.payoutKey !== intent.payload.payoutKey || JSON.stringify(prior) !== JSON.stringify(intent))) {
    throw new Error('An unresolved payout already exists. Verify or retry it before starting another.');
  }
  storage.setItem(masterPayoutStorageKey(intent.tenantId, intent.userId), JSON.stringify(prior ?? intent));
  if (!readMasterPayoutIntent(storage, intent.tenantId, intent.userId)) throw new Error('The payout request was not saved; nothing was submitted.');
}

export function clearMasterPayoutIntent(storage: StorageLike, intent: MasterPayoutIntent) {
  if (readMasterPayoutIntent(storage, intent.tenantId, intent.userId)?.payload.payoutKey === intent.payload.payoutKey) {
    storage.removeItem(masterPayoutStorageKey(intent.tenantId, intent.userId));
  }
}
