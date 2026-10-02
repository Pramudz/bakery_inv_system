import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Product } from '../products/products.entity';
import { InvoiceDetail } from '../invoices/invoice-detail.entity';
import { InvoiceRefund } from './invoice-refund.entity';

@Entity('tbl_invoice_refund_detail')
export class InvoiceRefundDetail extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'invoice_refund_detail_id', type: 'bigint' }) invoiceRefundDetailId!: number;
  @Column({ name: 'invoice_refund_id', type: 'bigint' }) invoiceRefundId!: number;
  @ManyToOne(() => InvoiceRefund, (refund) => refund.details, { nullable: false, onDelete: 'CASCADE' }) @JoinColumn({ name: 'invoice_refund_id' }) invoiceRefund!: InvoiceRefund;
  @Column({ name: 'invoice_detail_id', type: 'bigint' }) invoiceDetailId!: number;
  @ManyToOne(() => InvoiceDetail, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'invoice_detail_id' }) invoiceDetail!: InvoiceDetail;
  @Column({ name: 'product_id', type: 'bigint' }) productId!: number;
  @ManyToOne(() => Product, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'product_id' }) product!: Product;
  @Column({ name: 'quantity', type: 'decimal', precision: 18, scale: 4 }) quantity!: string;
  @Column({ name: 'unit_price', type: 'decimal', precision: 18, scale: 2 }) unitPrice!: string;
  @Column({ name: 'discount_percentage', type: 'decimal', precision: 7, scale: 4, default: 0 }) discountPercentage!: string;
  @Column({ name: 'discount_amount', type: 'decimal', precision: 18, scale: 2, default: 0 }) discountAmount!: string;
  @Column({ name: 'refund_amount', type: 'decimal', precision: 18, scale: 2 }) refundAmount!: string;
  @Column({ name: 'return_to_stock', default: true }) returnToStock!: boolean;
}
