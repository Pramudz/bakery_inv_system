import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { PaymentMethod, PaymentMethodType } from '../payment-methods/payment-methods.entity';
import { PaymentChannel } from '../payment-channels/payment-channel.entity';
import { User } from '../users/user.entity';
import { InvoiceRefund } from './invoice-refund.entity';

@Entity('tbl_invoice_refund_payment')
export class InvoiceRefundPayment extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'invoice_refund_payment_id', type: 'bigint' }) invoiceRefundPaymentId!: number;
  @Column({ name: 'invoice_refund_id', type: 'bigint' }) invoiceRefundId!: number;
  @ManyToOne(() => InvoiceRefund, (refund) => refund.payments, { nullable: false, onDelete: 'CASCADE' }) @JoinColumn({ name: 'invoice_refund_id' }) invoiceRefund!: InvoiceRefund;
  @Column({ name: 'payment_method_id', type: 'bigint' }) paymentMethodId!: number;
  @ManyToOne(() => PaymentMethod, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'payment_method_id' }) paymentMethod!: PaymentMethod;
  @Column({ name: 'payment_method_type_snapshot', type: 'varchar', length: 20, nullable: true }) paymentMethodTypeSnapshot!: PaymentMethodType | null;
  @Column({ name: 'payment_channel_id', type: 'bigint', nullable: true }) paymentChannelId!: number | null;
  @ManyToOne(() => PaymentChannel, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'payment_channel_id' }) paymentChannel!: PaymentChannel | null;
  @Column({ name: 'payment_channel_code_snapshot', type: 'varchar', length: 50, nullable: true }) paymentChannelCodeSnapshot!: string | null;
  @Column({ name: 'payment_channel_name_snapshot', type: 'varchar', length: 150, nullable: true }) paymentChannelNameSnapshot!: string | null;
  @Column({ name: 'amount', type: 'decimal', precision: 18, scale: 2 }) amount!: string;
  @Column({ name: 'reference_number', type: 'varchar', length: 100, nullable: true }) referenceNumber!: string | null;
  @Column({ name: 'refunded_at', type: 'datetime' }) refundedAt!: Date;
  @Column({ name: 'created_by_user_id', type: 'bigint' }) createdByUserId!: number;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'created_by_user_id' }) createdByUser!: User;
}
