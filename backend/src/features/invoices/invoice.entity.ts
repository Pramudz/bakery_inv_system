import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Tenant } from '../tenants/tenant.entity';
import { Location } from '../locations/locations.entity';
import { Customer } from '../customers/customers.entity';
import { User } from '../users/user.entity';
import { InvoiceDetail } from './invoice-detail.entity';
import { InvoicePayment } from './invoice-payment.entity';

@Entity('tbl_invoice')
@Index('uq_invoice_tenant_number', ['tenantId', 'invoiceNumber'], { unique: true })
@Index('uq_invoice_tenant_checkout', ['tenantId', 'checkoutKey'], { unique: true })
export class Invoice extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'invoice_id', type: 'bigint' }) invoiceId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @Column({ name: 'location_id', type: 'bigint' }) locationId!: number;
  @ManyToOne(() => Location, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'location_id' }) location!: Location;
  @Column({ name: 'customer_id', type: 'bigint', nullable: true }) customerId!: number | null;
  @ManyToOne(() => Customer, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'customer_id' }) customer!: Customer | null;
  @Column({ name: 'invoice_number', type: 'varchar', length: 50 }) invoiceNumber!: string;
  @Column({ name: 'checkout_key', type: 'varchar', length: 36 }) checkoutKey!: string;
  @Column({ name: 'checkout_fingerprint', type: 'char', length: 64 }) checkoutFingerprint!: string;
  @Column({ name: 'invoice_date', type: 'datetime' }) invoiceDate!: Date;
  @Column({ name: 'sale_type', type: 'varchar', length: 20 }) saleType!: string;
  @Column({ name: 'subtotal', type: 'decimal', precision: 18, scale: 2 }) subtotal!: string;
  @Column({ name: 'discount_total', type: 'decimal', precision: 18, scale: 2, default: 0 }) discountTotal!: string;
  @Column({ name: 'grand_total', type: 'decimal', precision: 18, scale: 2 }) grandTotal!: string;
  @Column({ name: 'paid_amount', type: 'decimal', precision: 18, scale: 2, default: 0 }) paidAmount!: string;
  @Column({ name: 'tendered_amount', type: 'decimal', precision: 18, scale: 2, default: 0 }) tenderedAmount!: string;
  @Column({ name: 'change_amount', type: 'decimal', precision: 18, scale: 2, default: 0 }) changeAmount!: string;
  @Column({ name: 'balance_amount', type: 'decimal', precision: 18, scale: 2, default: 0 }) balanceAmount!: string;
  @Column({ name: 'payment_status', type: 'varchar', length: 20 }) paymentStatus!: string;
  @Column({ name: 'invoice_status', type: 'varchar', length: 20, default: 'COMPLETED' }) invoiceStatus!: string;
  @Column({ name: 'is_credit_sale', default: false }) isCreditSale!: boolean;
  @Column({ name: 'credit_authorized_by_user_id', type: 'bigint', nullable: true }) creditAuthorizedByUserId!: number | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'credit_authorized_by_user_id' }) creditAuthorizedByUser!: User | null;
  @Column({ name: 'credit_authorized_at', type: 'datetime', nullable: true }) creditAuthorizedAt!: Date | null;
  @Column({ name: 'receipt_snapshot', type: 'json', nullable: true }) receiptSnapshot!: Record<string, any> | null;
  @Column({ name: 'created_by_user_id', type: 'bigint' }) createdByUserId!: number;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'created_by_user_id' }) createdByUser!: User;
  @OneToMany(() => InvoiceDetail, (detail) => detail.invoice) details!: InvoiceDetail[];
  @OneToMany(() => InvoicePayment, (payment) => payment.invoice) payments!: InvoicePayment[];
}
