import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Product } from '../products/products.entity';
import { Invoice } from './invoice.entity';

@Entity('tbl_invoice_detail')
@Index('uq_invoice_detail_line_number', ['invoiceId', 'lineNumber'], { unique: true })
export class InvoiceDetail extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'invoice_detail_id', type: 'bigint' }) invoiceDetailId!: number;
  @Column({ name: 'invoice_id', type: 'bigint' }) invoiceId!: number;
  @Column({ name: 'line_number', type: 'int' }) lineNumber!: number;
  @ManyToOne(() => Invoice, (invoice) => invoice.details, { nullable: false, onDelete: 'CASCADE' }) @JoinColumn({ name: 'invoice_id' }) invoice!: Invoice;
  @Column({ name: 'product_id', type: 'bigint' }) productId!: number;
  @Column({ name: 'sku_snapshot', type: 'varchar', length: 100, nullable: true }) skuSnapshot!: string | null;
  @Column({ name: 'product_name_snapshot', type: 'varchar', length: 255, nullable: true }) productNameSnapshot!: string | null;
  @Column({ name: 'unit_id', type: 'bigint', nullable: true }) unitId!: number | null;
  @Column({ name: 'unit_code_snapshot', type: 'varchar', length: 30, nullable: true }) unitCodeSnapshot!: string | null;
  @Column({ name: 'unit_name_snapshot', type: 'varchar', length: 100, nullable: true }) unitNameSnapshot!: string | null;
  @ManyToOne(() => Product, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'product_id' }) product!: Product;
  @Column({ name: 'quantity', type: 'decimal', precision: 18, scale: 4 }) quantity!: string;
  @Column({ name: 'unit_price', type: 'decimal', precision: 18, scale: 2 }) unitPrice!: string;
  @Column({ name: 'discount_percentage', type: 'decimal', precision: 7, scale: 4, default: 0 }) discountPercentage!: string;
  @Column({ name: 'discount_amount', type: 'decimal', precision: 18, scale: 2, default: 0 }) discountAmount!: string;
  @Column({ name: 'gross_total', type: 'decimal', precision: 18, scale: 2 }) grossTotal!: string;
  @Column({ name: 'net_total', type: 'decimal', precision: 18, scale: 2 }) netTotal!: string;
  @Column({ name: 'unit_cost_snapshot', type: 'decimal', precision: 18, scale: 4, nullable: true }) unitCostSnapshot!: string | null;
  @Column({ name: 'cogs_amount', type: 'decimal', precision: 18, scale: 4, nullable: true }) cogsAmount!: string | null;
  @Column({ name: 'price_source', type: 'varchar', length: 20, nullable: true }) priceSource!: 'PRICE_LIST' | 'QUOTATION' | null;
  @Column({ name: 'source_price_list_item_id', type: 'bigint', nullable: true }) sourcePriceListItemId!: number | null;
  @Column({ name: 'source_quotation_line_id', type: 'bigint', nullable: true }) sourceQuotationLineId!: number | null;
  @Column({ name: 'taxable_amount', type: 'decimal', precision: 18, scale: 2, nullable: true }) taxableAmount!: string | null;
  @Column({ name: 'tax_amount', type: 'decimal', precision: 18, scale: 2, default: 0 }) taxAmount!: string;
  @Column({ name: 'tax_rate_snapshot', type: 'decimal', precision: 7, scale: 4, default: 0 }) taxRateSnapshot!: string;
  @Column({ name: 'tax_inclusive', default: false }) taxInclusive!: boolean;
  @Column({ name: 'tax_code_snapshot', type: 'varchar', length: 50, nullable: true }) taxCodeSnapshot!: string | null;
}
