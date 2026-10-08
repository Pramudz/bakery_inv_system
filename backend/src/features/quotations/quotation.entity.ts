import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Customer } from '../customers/customers.entity';
import { Location } from '../locations/locations.entity';
import { Invoice } from '../invoices/invoice.entity';
import { User } from '../users/user.entity';
import { QuotationLine } from './quotation-line.entity';

export type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'CONVERTED';

@Entity('tbl_quotation')
@Index('uq_quotation_tenant_number', ['tenantId', 'quotationNumber'], { unique: true })
@Index('ix_quotation_tenant_location_date', ['tenantId', 'locationId', 'quotationDate'])
export class Quotation extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'quotation_id', type: 'bigint' }) quotationId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @Column({ name: 'location_id', type: 'bigint' }) locationId!: number;
  @ManyToOne(() => Location, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'location_id' }) location!: Location;
  @Column({ name: 'customer_id', type: 'bigint' }) customerId!: number;
  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'customer_id' }) customer!: Customer;
  @Column({ name: 'quotation_number', type: 'varchar', length: 50 }) quotationNumber!: string;
  @Column({ name: 'quotation_date', type: 'date' }) quotationDate!: string;
  @Column({ name: 'valid_until', type: 'date' }) validUntil!: string;
  @Column({ name: 'status', type: 'varchar', length: 20 }) status!: QuotationStatus;
  @Column({ name: 'quotation_type', type: 'varchar', length: 20 }) quotationType!: 'RETAIL' | 'WHOLESALE';
  @Column({ name: 'subtotal', type: 'decimal', precision: 18, scale: 2 }) subtotal!: string;
  @Column({ name: 'discount_total', type: 'decimal', precision: 18, scale: 2 }) discountTotal!: string;
  @Column({ name: 'grand_total', type: 'decimal', precision: 18, scale: 2 }) grandTotal!: string;
  @Column({ name: 'notes', type: 'text', nullable: true }) notes!: string | null;
  @Column({ name: 'terms_and_conditions', type: 'text', nullable: true }) termsAndConditions!: string | null;
  @Column({ name: 'customer_name_snapshot', type: 'varchar', length: 200 }) customerNameSnapshot!: string;
  @Column({ name: 'customer_code_snapshot', type: 'varchar', length: 50 }) customerCodeSnapshot!: string;
  @Column({ name: 'customer_phone_snapshot', type: 'varchar', length: 50, nullable: true }) customerPhoneSnapshot!: string | null;
  @Column({ name: 'customer_email_snapshot', type: 'varchar', length: 150, nullable: true }) customerEmailSnapshot!: string | null;
  @Column({ name: 'customer_address_snapshot', type: 'text', nullable: true }) customerAddressSnapshot!: string | null;
  @Column({ name: 'location_code_snapshot', type: 'varchar', length: 50 }) locationCodeSnapshot!: string;
  @Column({ name: 'location_name_snapshot', type: 'varchar', length: 150 }) locationNameSnapshot!: string;
  @Column({ name: 'created_by_user_id', type: 'bigint' }) createdByUserId!: number;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'created_by_user_id' }) createdByUser!: User;
  @Column({ name: 'updated_by_user_id', type: 'bigint', nullable: true }) updatedByUserId!: number | null;
  @Column({ name: 'sent_at', type: 'datetime', nullable: true }) sentAt!: Date | null;
  @Column({ name: 'sent_by_user_id', type: 'bigint', nullable: true }) sentByUserId!: number | null;
  @Column({ name: 'accepted_at', type: 'datetime', nullable: true }) acceptedAt!: Date | null;
  @Column({ name: 'accepted_by_user_id', type: 'bigint', nullable: true }) acceptedByUserId!: number | null;
  @Column({ name: 'rejected_at', type: 'datetime', nullable: true }) rejectedAt!: Date | null;
  @Column({ name: 'rejected_by_user_id', type: 'bigint', nullable: true }) rejectedByUserId!: number | null;
  @Column({ name: 'cancelled_at', type: 'datetime', nullable: true }) cancelledAt!: Date | null;
  @Column({ name: 'cancelled_by_user_id', type: 'bigint', nullable: true }) cancelledByUserId!: number | null;
  @Column({ name: 'converted_at', type: 'datetime', nullable: true }) convertedAt!: Date | null;
  @Column({ name: 'converted_by_user_id', type: 'bigint', nullable: true }) convertedByUserId!: number | null;
  @Column({ name: 'converted_invoice_id', type: 'bigint', nullable: true }) convertedInvoiceId!: number | null;
  @ManyToOne(() => Invoice, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'converted_invoice_id' }) convertedInvoice!: Invoice | null;
  @OneToMany(() => QuotationLine, line => line.quotation) lines!: QuotationLine[];
}
