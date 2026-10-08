import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Product } from '../products/products.entity';
import { Quotation } from './quotation.entity';

@Entity('tbl_quotation_line')
@Index('uq_quotation_line_number', ['quotationId', 'lineNumber'], { unique: true })
export class QuotationLine extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'quotation_line_id', type: 'bigint' }) quotationLineId!: number;
  @Column({ name: 'quotation_id', type: 'bigint' }) quotationId!: number;
  @ManyToOne(() => Quotation, quotation => quotation.lines, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'quotation_id' }) quotation!: Quotation;
  @Column({ name: 'line_number', type: 'int' }) lineNumber!: number;
  @Column({ name: 'product_id', type: 'bigint' }) productId!: number;
  @ManyToOne(() => Product, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'product_id' }) product!: Product;
  @Column({ name: 'product_code_snapshot', type: 'varchar', length: 100 }) productCodeSnapshot!: string;
  @Column({ name: 'product_name_snapshot', type: 'varchar', length: 255 }) productNameSnapshot!: string;
  @Column({ name: 'unit_id', type: 'bigint' }) unitId!: number;
  @Column({ name: 'unit_code_snapshot', type: 'varchar', length: 30 }) unitCodeSnapshot!: string;
  @Column({ name: 'unit_name_snapshot', type: 'varchar', length: 100 }) unitNameSnapshot!: string;
  @Column({ name: 'quantity', type: 'decimal', precision: 18, scale: 4 }) quantity!: string;
  @Column({ name: 'list_price', type: 'decimal', precision: 18, scale: 2 }) listPrice!: string;
  @Column({ name: 'unit_price', type: 'decimal', precision: 18, scale: 2 }) unitPrice!: string;
  @Column({ name: 'discount_percent', type: 'decimal', precision: 7, scale: 4 }) discountPercent!: string;
  @Column({ name: 'discount_amount', type: 'decimal', precision: 18, scale: 2 }) discountAmount!: string;
  @Column({ name: 'gross_total', type: 'decimal', precision: 18, scale: 2 }) grossTotal!: string;
  @Column({ name: 'net_total', type: 'decimal', precision: 18, scale: 2 }) netTotal!: string;
}
