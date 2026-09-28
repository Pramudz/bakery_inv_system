import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { PaymentMethod } from '../payment-methods/payment-methods.entity';
import { User } from '../users/user.entity';
import { Invoice } from './invoice.entity';

@Entity('tbl_invoice_payment')
@Index('uq_invoice_payment_collection', ['invoiceId', 'collectionKey'], { unique: true })
export class InvoicePayment extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'invoice_payment_id', type: 'bigint' }) invoicePaymentId!: number;
  @Column({ name: 'invoice_id', type: 'bigint' }) invoiceId!: number;
  @ManyToOne(() => Invoice, (invoice) => invoice.payments, { nullable: false, onDelete: 'CASCADE' }) @JoinColumn({ name: 'invoice_id' }) invoice!: Invoice;
  @Column({ name: 'payment_method_id', type: 'bigint' }) paymentMethodId!: number;
  @ManyToOne(() => PaymentMethod, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'payment_method_id' }) paymentMethod!: PaymentMethod;
  @Column({ name: 'amount', type: 'decimal', precision: 18, scale: 2 }) amount!: string;
  @Column({ name: 'tendered_amount', type: 'decimal', precision: 18, scale: 2 }) tenderedAmount!: string;
  @Column({ name: 'change_amount', type: 'decimal', precision: 18, scale: 2, default: 0 }) changeAmount!: string;
  @Column({ name: 'reference_number', type: 'varchar', length: 100, nullable: true }) referenceNumber!: string | null;
  @Column({ name: 'paid_at', type: 'datetime' }) paidAt!: Date;
  @Column({ name: 'created_by_user_id', type: 'bigint' }) createdByUserId!: number;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'created_by_user_id' }) createdByUser!: User;
  @Column({ name: 'is_reversed', default: false }) isReversed!: boolean;
  @Column({ name: 'reversed_at', type: 'datetime', nullable: true }) reversedAt!: Date | null;
  @Column({ name: 'collection_key', type: 'varchar', length: 36, nullable: true }) collectionKey!: string | null;
  @Column({ name: 'balance_before', type: 'decimal', precision: 18, scale: 2, nullable: true }) balanceBefore!: string | null;
  @Column({ name: 'balance_after', type: 'decimal', precision: 18, scale: 2, nullable: true }) balanceAfter!: string | null;
}
