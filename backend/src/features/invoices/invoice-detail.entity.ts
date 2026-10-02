import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Product } from '../products/products.entity';
import { Invoice } from './invoice.entity';

@Entity('tbl_invoice_detail')
export class InvoiceDetail extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'invoice_detail_id', type: 'bigint' }) invoiceDetailId!: number;
  @Column({ name: 'invoice_id', type: 'bigint' }) invoiceId!: number;
  @ManyToOne(() => Invoice, (invoice) => invoice.details, { nullable: false, onDelete: 'CASCADE' }) @JoinColumn({ name: 'invoice_id' }) invoice!: Invoice;
  @Column({ name: 'product_id', type: 'bigint' }) productId!: number;
  @ManyToOne(() => Product, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'product_id' }) product!: Product;
  @Column({ name: 'quantity', type: 'decimal', precision: 18, scale: 4 }) quantity!: string;
  @Column({ name: 'unit_price', type: 'decimal', precision: 18, scale: 2 }) unitPrice!: string;
  @Column({ name: 'discount_percentage', type: 'decimal', precision: 7, scale: 4, default: 0 }) discountPercentage!: string;
  @Column({ name: 'discount_amount', type: 'decimal', precision: 18, scale: 2, default: 0 }) discountAmount!: string;
  @Column({ name: 'gross_total', type: 'decimal', precision: 18, scale: 2 }) grossTotal!: string;
  @Column({ name: 'net_total', type: 'decimal', precision: 18, scale: 2 }) netTotal!: string;
}
