import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import applicationDataSource from '../../data-source';
import { Location, LocationType } from '../locations/locations.entity';
import { PosLocationConfig, PosRegisterMode } from '../pos-registers/pos-location-config.entity';
import { PosCashRegister } from '../pos-registers/pos-cash-register.entity';
import { PosRegisterSession, PosRegisterSessionStatus } from '../pos-registers/pos-register-session.entity';
import { PosSessionsService } from '../pos-registers/pos-sessions.service';
import { Customer } from '../customers/customers.entity';
import { Invoice } from '../invoices/invoice.entity';
import { InvoicePayment } from '../invoices/invoice-payment.entity';
import { InvoiceRefund } from './invoice-refund.entity';
import { InvoiceRefundPayment } from './invoice-refund-payment.entity';
import { InvoiceRefundsService } from './invoice-refunds.service';
import { PaymentMethod, PaymentMethodType } from '../payment-methods/payment-methods.entity';
import { PosCashMovement } from '../pos-registers/pos-cash-movement.entity';
import { TenantPrincipal } from '../auth/auth.types';

test('disposable MySQL master payout lookup and same-key retry retain one financial movement', async () => {
  assert.equal(process.env.DB_DATABASE, 'dev_erp_product_import_test');
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST ?? ''));
  const ds = await applicationDataSource.initialize();
  try {
    const [{ db }] = await ds.query('SELECT DATABASE() AS db');
    assert.equal(db, 'dev_erp_product_import_test');
    const base = await ds.getRepository(Invoice).findOne({ where: {}, order: { invoiceId: 'DESC' } });
    assert.ok(base);
    const method = await ds.getRepository(PaymentMethod).findOneBy({ tenantId: base.tenantId, paymentMethodType: PaymentMethodType.CASH, isActive: true });
    assert.ok(method);
    const user = { scope: 'TENANT', tenantId: Number(base.tenantId), userId: Number(base.createdByUserId), username: 'master-payout-test', roleId: 0,
      roleCode: 'TENANT_ADMIN', accessScope: 'TENANT', assignedLocationIds: [] } as TenantPrincipal;
    const suffix = randomUUID();
    const location = await ds.getRepository(Location).save(ds.getRepository(Location).create({ tenantId: user.tenantId, code: `MP-${suffix}`, name: 'Master payout test location', locationType: LocationType.STORE, isActive: true }));
    await ds.getRepository(PosLocationConfig).save(ds.getRepository(PosLocationConfig).create({ tenantId: user.tenantId, locationId: location.locationId, registerMode: PosRegisterMode.MASTER_REGISTER }));
    const register = await ds.getRepository(PosCashRegister).save(ds.getRepository(PosCashRegister).create({ tenantId: user.tenantId, locationId: location.locationId,
      posTerminalId: null, registerMode: PosRegisterMode.MASTER_REGISTER, registerKey: `MASTER:${location.locationId}`, displayName: 'Dedicated payout test drawer', isActive: true }));
    const session = await ds.getRepository(PosRegisterSession).save(ds.getRepository(PosRegisterSession).create({ posCashRegisterId: register.posCashRegisterId,
      tenantId: user.tenantId, locationId: location.locationId, businessDate: '2026-10-11', openingBalance: '0.00', openedByUserId: user.userId,
      openedAt: new Date(), status: PosRegisterSessionStatus.OPEN, closedAt: null, closedByUserId: null }));
    const customer = await ds.getRepository(Customer).save(ds.getRepository(Customer).create({ tenantId: user.tenantId, customerCode: `MP-${suffix}`,
      customerName: 'Master payout test customer', isActive: true }));
    const invoice = await ds.getRepository(Invoice).save(ds.getRepository(Invoice).create({ tenantId: user.tenantId, locationId: location.locationId,
      customerId: customer.customerId, checkoutKey: randomUUID(), checkoutFingerprint: 'a'.repeat(64), invoiceNumber: `MP-${suffix}`, invoiceDate: new Date(),
      saleType: 'RETAIL', subtotal: '100.00', discountTotal: '0.00', grandTotal: '100.00', paidAmount: '100.00', tenderedAmount: '100.00',
      changeAmount: '0.00', balanceAmount: '0.00', paymentStatus: 'PAID', invoiceStatus: 'PARTIALLY_REFUNDED', createdByUserId: user.userId }));
    await ds.getRepository(InvoicePayment).save(ds.getRepository(InvoicePayment).create({ tenantId: user.tenantId, invoiceId: invoice.invoiceId,
      paymentMethodId: method.paymentMethodId, paymentMethodTypeSnapshot: PaymentMethodType.CASH, paymentChannelId: null, amount: '100.00',
      tenderedAmount: '100.00', changeAmount: '0.00', paidAt: new Date(), createdByUserId: user.userId, isReversed: false, collectionKey: null }));
    const refund = await ds.getRepository(InvoiceRefund).save(ds.getRepository(InvoiceRefund).create({ tenantId: user.tenantId, locationId: location.locationId,
      invoiceId: invoice.invoiceId, refundNumber: `MP-${suffix}`, refundDate: new Date(), reason: 'Dedicated payout recovery test',
      subtotal: '40.00', discountTotal: '0.00', refundTotal: '40.00', status: 'COMPLETED', createdByUserId: user.userId, refundKey: randomUUID() }));
    const service = new InvoiceRefundsService(ds, new PosSessionsService(ds));
    const dto = { payoutKey: randomUUID(), locationId: Number(location.locationId), posRegisterSessionId: Number(session.posRegisterSessionId),
      paymentMethodId: Number(method.paymentMethodId), amount: 20, reason: 'Dedicated test payout', physicalPayerIdentity: 'Audit cashier' };
    await service.recordMasterRefundPayout(Number(refund.invoiceRefundId), dto, user); // Discard the simulated HTTP response after COMMIT.
    const recovered = await service.masterPayoutOutcome(dto.payoutKey, user);
    const replay = await service.recordMasterRefundPayout(Number(refund.invoiceRefundId), dto, user);
    assert.equal(Number(recovered.posCashMovementId), Number(replay.posCashMovementId));
    assert.equal((await ds.getRepository(PosCashMovement).findBy({ tenantId: user.tenantId, payoutKey: dto.payoutKey })).length, 1);
    assert.equal((await ds.getRepository(InvoiceRefundPayment).findBy({ invoiceRefundId: refund.invoiceRefundId })).length, 1);
    assert.equal((await ds.getRepository(PosCashMovement).findBy({ tenantId: user.tenantId, sourceType: 'INVOICE_REFUND_PAYMENT', sourceId: recovered.sourceId })).length, 1);
    assert.equal((await ds.getRepository(Invoice).findOneByOrFail({ invoiceId: invoice.invoiceId })).balanceAmount, '0.00');
    console.log(JSON.stringify({ tenantId: user.tenantId, locationId: location.locationId, registerSessionId: session.posRegisterSessionId,
      invoiceId: invoice.invoiceId, refundId: refund.invoiceRefundId, payoutKey: dto.payoutKey, movementId: recovered.posCashMovementId,
      refundPaymentId: recovered.sourceId }));
  } finally { await ds.destroy(); }
});
