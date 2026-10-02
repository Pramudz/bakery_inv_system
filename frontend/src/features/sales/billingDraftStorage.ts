import type { PosPaymentEntry } from './paymentDraft';

export type StoredBillingDraft = {
  version: 1;
  checkoutKey: string;
  saleType: 'Retail' | 'Wholesale';
  cart: unknown[];
  selectedCustomer: unknown | null;
  sellOnCredit: boolean;
  paymentEntries: PosPaymentEntry[];
  savedAt: string;
};

export interface BillingDraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function billingDraftKey(tenantId: string | number, userId: string | number, locationId: string | number) {
  return `erp:billing-draft:v1:${tenantId}:${userId}:${locationId}`;
}

export function readBillingDraft(storage: BillingDraftStorage, key: string): StoredBillingDraft | null {
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? 'null') as StoredBillingDraft | null;
    if (!parsed || parsed.version !== 1 || !parsed.checkoutKey || !Array.isArray(parsed.cart) || !Array.isArray(parsed.paymentEntries)) return null;
    return parsed;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function writeBillingDraft(storage: BillingDraftStorage, key: string, draft: Omit<StoredBillingDraft, 'version' | 'savedAt'>) {
  storage.setItem(key, JSON.stringify({ ...draft, version: 1, savedAt: new Date().toISOString() } satisfies StoredBillingDraft));
}

export function removeBillingDraft(storage: BillingDraftStorage, key: string) {
  storage.removeItem(key);
}
