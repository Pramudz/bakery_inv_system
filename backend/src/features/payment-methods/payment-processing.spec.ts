import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PaymentChannel } from '../payment-channels/payment-channel.entity';
import { PaymentMethod, PaymentMethodType } from './payment-methods.entity';
import { PaymentProcessingService } from './payment-processing.service';

const service = new PaymentProcessingService();
const methods = [
  { paymentMethodId: 1, tenantId: 1, isActive: true, paymentMethodName: 'Cash Drawer', paymentMethodType: PaymentMethodType.CASH },
  { paymentMethodId: 2, tenantId: 1, isActive: true, paymentMethodName: 'Visa / Mastercard', paymentMethodType: PaymentMethodType.CARD },
  { paymentMethodId: 3, tenantId: 1, isActive: true, paymentMethodName: 'Cheque', paymentMethodType: PaymentMethodType.CHEQUE },
  { paymentMethodId: 4, tenantId: 1, isActive: true, paymentMethodName: 'Credit', paymentMethodType: null },
];
const channels = [
  { paymentChannelId: 10, tenantId: 1, isActive: true, code: 'COMMERCIAL', name: 'Commercial' },
  { paymentChannelId: 12, tenantId: 1, isActive: false, code: 'OLD', name: 'Old channel' },
  { paymentChannelId: 13, tenantId: 2, isActive: true, code: 'OTHER', name: 'Other tenant' },
];
const manager = { getRepository(entity: unknown) {
  const rows = entity === PaymentMethod ? methods : entity === PaymentChannel ? channels : [];
  return { findOneBy: async (where: Record<string, unknown>) => rows.find((row) => Object.entries(where).every(([key, value]) => (row as any)[key] === value)) ?? null };
} } as any;

test('cash over-tender separates tendered, applied, change and net received', async () => {
  const [payment] = await service.prepare(manager, 1, [{ paymentMethodId: 1, amount: 120 }], 100);
  assert.deepEqual({ tendered: payment.tendered, applied: payment.applied, change: payment.change, net: payment.tendered - payment.change }, { tendered: 120, applied: 100, change: 20, net: 100 });
});

test('noncash over-tender is rejected', async () => {
  await assert.rejects(service.prepare(manager, 1, [{ paymentMethodId: 3, amount: 101 }], 100), /Only cash/i);
});

test('split cash and card snapshots applied amounts without zero rows', async () => {
  const rows = await service.prepare(manager, 1, [{ paymentMethodId: 1, amount: 40 }, { paymentMethodId: 2, paymentChannelId: 10, referenceNumber: ' AP-123 ', amount: 60 }], 100);
  assert.deepEqual(rows.map((row) => [row.method.paymentMethodType, row.applied, row.tendered, row.change]), [['CASH', 40, 40, 0], ['CARD', 60, 60, 0]]);
  assert.equal(rows[1].channel?.name, 'Commercial');
  assert.equal(rows[1].referenceNumber, 'AP-123');
  await assert.rejects(service.prepare(manager, 1, [{ paymentMethodId: 1, amount: 100 }, { paymentMethodId: 3, amount: 1 }], 100), /cannot be added/i);
});

test('card requires an approval reference and an active channel owned by the tenant', async () => {
  await assert.rejects(service.prepare(manager, 1, [{ paymentMethodId: 2, paymentChannelId: 10, amount: 10 }], 10), /approval/i);
  const [valid] = await service.prepare(manager, 1, [{ paymentMethodId: 2, paymentChannelId: 10, referenceNumber: 'OK', amount: 10 }], 10);
  assert.equal(valid.channel?.name, 'Commercial');
  for (const paymentChannelId of [12, 13, 999]) {
    await assert.rejects(service.prepare(manager, 1, [{ paymentMethodId: 2, paymentChannelId, referenceNumber: 'OK', amount: 10 }], 10), /inactive|tenant/i);
  }
});

test('ambiguous legacy methods remain unusable until manually classified', async () => {
  await assert.rejects(service.prepare(manager, 1, [{ paymentMethodId: 4, amount: 10 }], 10), /not been classified/i);
});
