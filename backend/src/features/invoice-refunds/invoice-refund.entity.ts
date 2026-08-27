import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Tenant } from '../tenants/tenant.entity';
import { Location } from '../locations/locations.entity';
import { User } from '../users/user.entity';
import { Invoice } from '../invoices/invoice.entity';
import { InvoiceRefundDetail } from './invoice-refund-detail.entity';
import { InvoiceRefundPayment } from './invoice-refund-payment.entity';

@Entity('tbl_invoice_refund')
@Index('uq_invoice_refund_tenant_number', ['tenantId', 'refundNumber'], { unique: true })
export class InvoiceRefund extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'invoice_refund_id', type: 'bigint' }) invoiceRefundId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @Column({ name: 'location_id', type: 'bigint' }) locationId!: number;
  @ManyToOne(() => Location, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'location_id' }) location!: Location;
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
