import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Tenant } from '../tenants/tenant.entity';
import { Invoice } from '../invoices/invoice.entity';
import { InvoiceDetail } from '../invoices/invoice-detail.entity';
import { PaymentMethod } from '../payment-methods/payment-methods.entity';
import { User } from '../users/user.entity';

@Entity('tbl_invoice_adjustment')
@Index('uq_invoice_adjustment_tenant_number', ['tenantId', 'adjustmentNumber'], { unique: true })
export class InvoiceAdjustment extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'invoice_adjustment_id', type: 'bigint' }) invoiceAdjustmentId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @Column({ name: 'invoice_id', type: 'bigint' }) invoiceId!: number;
  @ManyToOne(() => Invoice, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'invoice_id' }) invoice!: Invoice;
  @Column({ name: 'invoice_detail_id', type: 'bigint' }) invoiceDetailId!: number;
  @ManyToOne(() => InvoiceDetail, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'invoice_detail_id' }) invoiceDetail!: InvoiceDetail;
  @Column({ name: 'adjustment_number', type: 'varchar', length: 50 }) adjustmentNumber!: string;
  @Column({ name: 'adjustment_date', type: 'datetime' }) adjustmentDate!: Date;
  @Column({ name: 'adjustment_type', type: 'varchar', length: 10 }) adjustmentType!: 'CREDIT' | 'DEBIT';
  @Column({ name: 'reason', type: 'varchar', length: 255 }) reason!: string;
  @Column({ name: 'original_discount_percentage', type: 'decimal', precision: 7, scale: 4 }) originalDiscountPercentage!: string;
  @Column({ name: 'original_discount_amount', type: 'decimal', precision: 18, scale: 2 }) originalDiscountAmount!: string;
  @Column({ name: 'corrected_discount_percentage', type: 'decimal', precision: 7, scale: 4 }) correctedDiscountPercentage!: string;
  @Column({ name: 'corrected_discount_amount', type: 'decimal', precision: 18, scale: 2 }) correctedDiscountAmount!: string;
  @Column({ name: 'adjustment_amount', type: 'decimal', precision: 18, scale: 2 }) adjustmentAmount!: string;
  @Column({ name: 'payment_method_id', type: 'bigint', nullable: true }) paymentMethodId!: number | null;
  @ManyToOne(() => PaymentMethod, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'payment_method_id' }) paymentMethod!: PaymentMethod | null;
  @Column({ name: 'status', type: 'varchar', length: 20, default: 'SETTLED' }) status!: string;
  @Column({ name: 'created_by_user_id', type: 'bigint' }) createdByUserId!: number;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'created_by_user_id' }) createdByUser!: User;
}
