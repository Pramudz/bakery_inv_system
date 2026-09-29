import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Tenant } from '../tenants/tenant.entity';
import { Location } from '../locations/locations.entity';
import { User } from '../users/user.entity';
import { Invoice } from '../invoices/invoice.entity';
import { InvoiceRefundDetail } from './invoice-refund-detail.entity';
import { InvoiceRefundPayment } from './invoice-refund-payment.entity';
import { PosTerminal } from '../pos-registers/pos-terminal.entity';
import { PosRegisterSession } from '../pos-registers/pos-register-session.entity';
import { PosCashierSession } from '../pos-registers/pos-cashier-session.entity';

@Entity('tbl_invoice_refund')
@Index('uq_invoice_refund_tenant_number', ['tenantId', 'refundNumber'], { unique: true })
@Index('uq_invoice_refund_tenant_key', ['tenantId', 'refundKey'], { unique: true })
export class InvoiceRefund extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'invoice_refund_id', type: 'bigint' }) invoiceRefundId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @Column({ name: 'location_id', type: 'bigint' }) locationId!: number;
  @ManyToOne(() => Location, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'location_id' }) location!: Location;
  @Column({ name: 'refund_key', type: 'varchar', length: 36, nullable: true }) refundKey!: string | null;
  @Column({ name: 'refund_fingerprint', type: 'char', length: 64, nullable: true }) refundFingerprint!: string | null;
  @Column({ name: 'pos_terminal_id', type: 'bigint', nullable: true }) posTerminalId!: number | null;
  @ManyToOne(() => PosTerminal, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pos_terminal_id' }) terminal!: PosTerminal | null;
  @Column({ name: 'pos_register_session_id', type: 'bigint', nullable: true }) posRegisterSessionId!: number | null;
  @ManyToOne(() => PosRegisterSession, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pos_register_session_id' }) registerSession!: PosRegisterSession | null;
  @Column({ name: 'pos_cashier_session_id', type: 'bigint', nullable: true }) posCashierSessionId!: number | null;
  @ManyToOne(() => PosCashierSession, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pos_cashier_session_id' }) cashierSession!: PosCashierSession | null;
  @Column({ name: 'invoice_id', type: 'bigint' }) invoiceId!: number;
  @ManyToOne(() => Invoice, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'invoice_id' }) invoice!: Invoice;
  @Column({ name: 'refund_number', type: 'varchar', length: 50 }) refundNumber!: string;
  @Column({ name: 'refund_date', type: 'datetime' }) refundDate!: Date;
  @Column({ name: 'reason', type: 'varchar', length: 255 }) reason!: string;
  @Column({ name: 'subtotal', type: 'decimal', precision: 18, scale: 2 }) subtotal!: string;
  @Column({ name: 'discount_total', type: 'decimal', precision: 18, scale: 2, default: 0 }) discountTotal!: string;
  @Column({ name: 'refund_total', type: 'decimal', precision: 18, scale: 2 }) refundTotal!: string;
  @Column({ name: 'status', type: 'varchar', length: 20, default: 'COMPLETED' }) status!: string;
  @Column({ name: 'created_by_user_id', type: 'bigint' }) createdByUserId!: number;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'created_by_user_id' }) createdByUser!: User;
  @Column({ name: 'approved_by_user_id', type: 'bigint', nullable: true }) approvedByUserId!: number | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'approved_by_user_id' }) approvedByUser!: User | null;
  @OneToMany(() => InvoiceRefundDetail, (detail) => detail.invoiceRefund) details!: InvoiceRefundDetail[];
  @OneToMany(() => InvoiceRefundPayment, (payment) => payment.invoiceRefund) payments!: InvoiceRefundPayment[];
}
