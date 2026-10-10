/** Durable, per-user browser record of a submitted financial request. */
export type RecoveryKind = 'collection' | 'refund';
export type RecoveryStatus = 'submitted' | 'uncertain';

export type RecoveryIntent<T> = {
  version: 1;
  kind: RecoveryKind;
  tenantId: string;
  userId: string;
  invoiceId: number;
  locationId: number;
  registerSessionId: number | null;
  cashierSessionId: number | null;
  key: string;
  payload: T;
  status: RecoveryStatus;
  createdAt: string;
  updatedAt: string;
};

export interface RecoveryStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const prefix = 'erp:transaction-recovery:v1:';
const uuid4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const positiveId = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;
const positiveMoney = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 && Math.round((value + Number.EPSILON) * 100) / 100 === value;

function validPayload(kind: RecoveryKind, payload: Record<string, unknown>, invoiceId: number, key: string) {
  if (kind === 'collection') return payload.collectionKey === key && positiveMoney(payload.amount) && positiveId(payload.paymentMethodId)
    && (payload.paymentChannelId === undefined || positiveId(payload.paymentChannelId))
    && (payload.referenceNumber === undefined || (typeof payload.referenceNumber === 'string' && payload.referenceNumber.length <= 100));
  if (payload.refundKey !== key || payload.invoiceId !== invoiceId || typeof payload.reason !== 'string' || !payload.reason.trim()
    || !Array.isArray(payload.details) || !payload.details.length || !Array.isArray(payload.payments)) return false;
  return payload.details.every((raw) => {
    const line = raw as Record<string, unknown>;
    return positiveId(line.invoiceDetailId) && positiveId(line.quantity) && typeof line.returnToStock === 'boolean';
  }) && payload.payments.every((raw) => {
    const payment = raw as Record<string, unknown>;
    return positiveId(payment.paymentMethodId) && positiveMoney(payment.amount)
      && (payment.paymentChannelId === undefined || positiveId(payment.paymentChannelId))
      && (payment.referenceNumber === undefined || (typeof payment.referenceNumber === 'string' && payment.referenceNumber.length <= 100));
  });
}

export function recoveryStorageKey(kind: RecoveryKind, tenantId: string | number, userId: string | number, invoiceId: number) {
  return `${prefix}${kind}:${tenantId}:${userId}:${invoiceId}`;
}

function validIntent(value: unknown, kind: RecoveryKind, tenantId: string, userId: string, invoiceId: number): value is RecoveryIntent<unknown> {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const payload = row.payload as Record<string, unknown> | null;
  return row.version === 1 && row.kind === kind && row.tenantId === tenantId && row.userId === userId
    && row.invoiceId === invoiceId && positiveId(row.invoiceId) && positiveId(row.locationId)
    && (row.registerSessionId === null || positiveId(row.registerSessionId))
    && (row.cashierSessionId === null || positiveId(row.cashierSessionId))
    && typeof row.key === 'string' && uuid4.test(row.key)
    && (row.status === 'submitted' || row.status === 'uncertain')
    && typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt))
    && typeof row.updatedAt === 'string' && Number.isFinite(Date.parse(row.updatedAt))
    && payload !== null && typeof payload === 'object' && !Array.isArray(payload)
    && validPayload(kind, payload, invoiceId, row.key as string);
}

export function readRecoveryIntent<T>(storage: RecoveryStorage, kind: RecoveryKind, tenantId: string | number, userId: string | number, invoiceId: number): RecoveryIntent<T> | null {
  const key = recoveryStorageKey(kind, tenantId, userId, invoiceId);
  const raw = storage.getItem(key);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (validIntent(value, kind, String(tenantId), String(userId), invoiceId)) return value as RecoveryIntent<T>;
  } catch { /* Keep corrupted data for manual reconciliation. */ }
  throw new Error(`Saved ${kind} request for invoice ${invoiceId} is invalid. Check transaction history before clearing browser data or submitting again.`);
}

export function listRecoveryIntents<T>(storage: RecoveryStorage, kind: RecoveryKind, tenantId: string | number, userId: string | number): RecoveryIntent<T>[] {
  const scope = `${prefix}${kind}:${tenantId}:${userId}:`;
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => Boolean(key?.startsWith(scope)));
  return keys.map((key) => {
    const invoiceId = Number(key.slice(scope.length));
    if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) throw new Error(`Saved ${kind} request has an invalid invoice ID. Reconcile transaction history before proceeding.`);
    return readRecoveryIntent<T>(storage, kind, tenantId, userId, invoiceId)!;
  }).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function saveRecoveryIntent<T>(storage: RecoveryStorage, intent: RecoveryIntent<T>) {
  if (!validIntent(intent, intent.kind, intent.tenantId, intent.userId, intent.invoiceId)) throw new Error('The transaction request is invalid and was not submitted.');
  const key = recoveryStorageKey(intent.kind, intent.tenantId, intent.userId, intent.invoiceId);
  const existing = readRecoveryIntent<T>(storage, intent.kind, intent.tenantId, intent.userId, intent.invoiceId);
  if (existing && (existing.key !== intent.key || JSON.stringify(existing.payload) !== JSON.stringify(intent.payload))) {
    throw new Error('An unresolved transaction already exists for this invoice. Recover it before starting another.');
  }
  storage.setItem(key, JSON.stringify(existing ?? intent));
  if (!readRecoveryIntent<T>(storage, intent.kind, intent.tenantId, intent.userId, intent.invoiceId)) throw new Error('The transaction request could not be saved locally. Nothing was submitted.');
}

export function markRecoveryUncertain<T>(storage: RecoveryStorage, intent: RecoveryIntent<T>) {
  const key = recoveryStorageKey(intent.kind, intent.tenantId, intent.userId, intent.invoiceId);
  const current = readRecoveryIntent<T>(storage, intent.kind, intent.tenantId, intent.userId, intent.invoiceId);
  if (!current || current.key !== intent.key) throw new Error('The original transaction request is unavailable. Reconcile transaction history before proceeding.');
  storage.setItem(key, JSON.stringify({ ...current, status: 'uncertain', updatedAt: new Date().toISOString() }));
}

export function clearRecoveryIntent<T>(storage: RecoveryStorage, intent: RecoveryIntent<T>) {
  const current = readRecoveryIntent<T>(storage, intent.kind, intent.tenantId, intent.userId, intent.invoiceId);
  if (current?.key === intent.key) storage.removeItem(recoveryStorageKey(intent.kind, intent.tenantId, intent.userId, intent.invoiceId));
}

export function newRecoveryIntent<T extends { collectionKey?: string; refundKey?: string }>(kind: RecoveryKind, tenantId: string | number, userId: string | number, invoiceId: number | string, locationId: number | string, payload: T, context: { registerSessionId?: number | string | null; cashierSessionId?: number | string | null } = {}): RecoveryIntent<T> {
  const key = kind === 'collection' ? payload.collectionKey : payload.refundKey;
  if (!key || !uuid4.test(key)) throw new Error('A valid transaction UUID is required.');
  const now = new Date().toISOString();
  const intent: RecoveryIntent<T> = { version: 1, kind, tenantId: String(tenantId), userId: String(userId), invoiceId: Number(invoiceId), locationId: Number(locationId), registerSessionId: context.registerSessionId == null ? null : Number(context.registerSessionId), cashierSessionId: context.cashierSessionId == null ? null : Number(context.cashierSessionId), key, payload, status: 'submitted', createdAt: now, updatedAt: now };
  if (!validIntent(intent, kind, intent.tenantId, intent.userId, intent.invoiceId)) throw new Error('The transaction request is invalid and was not submitted.');
  return intent;
}

export async function withRecoveryLock<T>(kind: RecoveryKind, tenantId: string | number, userId: string | number, work: () => Promise<T>): Promise<T> {
  const locks = globalThis.navigator?.locks;
  if (locks) return locks.request(`${prefix}${kind}:${tenantId}:${userId}`, { mode: 'exclusive' }, work);
  return work();
}
