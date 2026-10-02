import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { InvoicePayment } from '../invoices/invoice-payment.entity';
import { User } from '../users/user.entity';

@Entity('tbl_invoice_payment_reversal')
@Index('uq_invoice_payment_reversal_key', ['reversalKey'], { unique: true })
export class InvoicePaymentReversal extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'payment_reversal_id', type: 'bigint' }) paymentReversalId!: number;
  @Column({ name: 'invoice_payment_id', type: 'bigint' }) invoicePaymentId!: number;
  @ManyToOne(() => InvoicePayment, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'invoice_payment_id' }) invoicePayment!: InvoicePayment;
  @Column({ name: 'reversal_key', type: 'varchar', length: 36, nullable: true }) reversalKey!: string | null;
  @Column({ name: 'reversal_fingerprint', type: 'char', length: 64, nullable: true }) reversalFingerprint!: string | null;
  @Column({ name: 'reversal_amount', type: 'decimal', precision: 18, scale: 2 }) reversalAmount!: string;
  @Column({ name: 'reason', type: 'varchar', length: 255 }) reason!: string;
  @Column({ name: 'reversed_at', type: 'datetime' }) reversedAt!: Date;
  @Column({ name: 'reversed_by_user_id', type: 'bigint' }) reversedByUserId!: number;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'reversed_by_user_id' }) reversedByUser!: User;
}
