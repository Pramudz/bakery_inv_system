import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Location } from '../locations/locations.entity';
import { InvoicePayment } from '../invoices/invoice-payment.entity';
import { Tenant } from '../tenants/tenant.entity';
import { PosCashReconciliation } from './pos-cash-reconciliation.entity';
import { PosCashierSession } from './pos-cashier-session.entity';
import { PosRegisterSession } from './pos-register-session.entity';

export enum PosReconciliationCoverageStatus { ACTIVE = 'ACTIVE', RELEASED = 'RELEASED' }

@Entity('tbl_pos_cash_reconciliation_payment')
@Index('uq_pos_reconciliation_payment_item', ['posCashReconciliationId', 'invoicePaymentId'], { unique: true })
@Index('uq_pos_reconciliation_payment_active', ['tenantId', 'activePaymentGuard'], { unique: true })
@Index('ix_pos_reconciliation_payment_cashier', ['posCashierSessionId', 'coverageStatus'])
export class PosCashReconciliationPayment extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'pos_cash_reconciliation_payment_id', type: 'bigint' }) posCashReconciliationPaymentId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @Column({ name: 'location_id', type: 'bigint' }) locationId!: number;
  @ManyToOne(() => Location, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'location_id' }) location!: Location;
  @Column({ name: 'pos_cash_reconciliation_id', type: 'bigint' }) posCashReconciliationId!: number;
  @ManyToOne(() => PosCashReconciliation, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pos_cash_reconciliation_id' }) reconciliation!: PosCashReconciliation;
  @Column({ name: 'pos_register_session_id', type: 'bigint' }) posRegisterSessionId!: number;
  @ManyToOne(() => PosRegisterSession, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pos_register_session_id' }) registerSession!: PosRegisterSession;
  @Column({ name: 'pos_cashier_session_id', type: 'bigint' }) posCashierSessionId!: number;
  @ManyToOne(() => PosCashierSession, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pos_cashier_session_id' }) cashierSession!: PosCashierSession;
  @Column({ name: 'invoice_payment_id', type: 'bigint' }) invoicePaymentId!: number;
  @ManyToOne(() => InvoicePayment, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'invoice_payment_id' }) invoicePayment!: InvoicePayment;
  @Column({ name: 'payment_method_type_snapshot', type: 'varchar', length: 20, nullable: true }) paymentMethodTypeSnapshot!: string | null;
  @Column({ name: 'applied_amount_snapshot', type: 'decimal', precision: 18, scale: 2 }) appliedAmountSnapshot!: string;
  @Column({ name: 'tendered_amount_snapshot', type: 'decimal', precision: 18, scale: 2 }) tenderedAmountSnapshot!: string;
  @Column({ name: 'change_amount_snapshot', type: 'decimal', precision: 18, scale: 2 }) changeAmountSnapshot!: string;
  @Column({ name: 'collection_key_snapshot', type: 'varchar', length: 36, nullable: true }) collectionKeySnapshot!: string | null;
  @Column({ name: 'paid_at_snapshot', type: 'datetime' }) paidAtSnapshot!: Date;
  @Column({ name: 'was_reversed_at_submission', type: 'boolean', default: false }) wasReversedAtSubmission!: boolean;
  @Column({ name: 'coverage_status', type: 'enum', enum: PosReconciliationCoverageStatus }) coverageStatus!: PosReconciliationCoverageStatus;
  @Column({ name: 'active_payment_guard', type: 'bigint', nullable: true, insert: false, update: false, select: false }) activePaymentGuard!: number | null;
}
