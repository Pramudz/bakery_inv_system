import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { PaymentMethod } from '../payment-methods/payment-methods.entity';
import { PaymentMethodType } from '../payment-methods/payment-methods.entity';
import { PaymentChannel } from '../payment-channels/payment-channel.entity';
import { User } from '../users/user.entity';
import { Invoice } from './invoice.entity';
import { PosTerminal } from '../pos-registers/pos-terminal.entity';
import { PosRegisterSession } from '../pos-registers/pos-register-session.entity';
import { PosCashierSession } from '../pos-registers/pos-cashier-session.entity';

@Entity('tbl_invoice_payment')
@Index('uq_invoice_payment_collection', ['invoiceId', 'collectionKey'], { unique: true })
export class InvoicePayment extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'invoice_payment_id', type: 'bigint' }) invoicePaymentId!: number;
  @Column({ name: 'invoice_id', type: 'bigint' }) invoiceId!: number;
  @ManyToOne(() => Invoice, (invoice) => invoice.payments, { nullable: false, onDelete: 'CASCADE' }) @JoinColumn({ name: 'invoice_id' }) invoice!: Invoice;
  @Column({ name: 'pos_terminal_id', type: 'bigint', nullable: true }) posTerminalId!: number | null;
  @ManyToOne(() => PosTerminal, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pos_terminal_id' }) terminal!: PosTerminal | null;
  @Column({ name: 'pos_register_session_id', type: 'bigint', nullable: true }) posRegisterSessionId!: number | null;
  @ManyToOne(() => PosRegisterSession, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pos_register_session_id' }) registerSession!: PosRegisterSession | null;
  @Column({ name: 'pos_cashier_session_id', type: 'bigint', nullable: true }) posCashierSessionId!: number | null;
  @ManyToOne(() => PosCashierSession, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pos_cashier_session_id' }) cashierSession!: PosCashierSession | null;
  @Column({ name: 'payment_method_id', type: 'bigint' }) paymentMethodId!: number;
  @ManyToOne(() => PaymentMethod, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'payment_method_id' }) paymentMethod!: PaymentMethod;
  @Column({ name: 'payment_method_type_snapshot', type: 'varchar', length: 20, nullable: true }) paymentMethodTypeSnapshot!: PaymentMethodType | null;
  @Column({ name: 'payment_channel_id', type: 'bigint', nullable: true }) paymentChannelId!: number | null;
  @ManyToOne(() => PaymentChannel, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'payment_channel_id' }) paymentChannel!: PaymentChannel | null;
  @Column({ name: 'payment_channel_code_snapshot', type: 'varchar', length: 50, nullable: true }) paymentChannelCodeSnapshot!: string | null;
  @Column({ name: 'payment_channel_name_snapshot', type: 'varchar', length: 150, nullable: true }) paymentChannelNameSnapshot!: string | null;
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
