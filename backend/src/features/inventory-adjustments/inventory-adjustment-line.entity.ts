import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { Product } from '../products/products.entity';
import { InventoryAdjustment } from './inventory-adjustment.entity';

@Entity('tbl_inventory_adjustment_line')
@Unique('uq_inventory_adjustment_line_product', ['inventoryAdjustmentId', 'productId'])
export class InventoryAdjustmentLine extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'inventory_adjustment_line_id', type: 'bigint' }) inventoryAdjustmentLineId!: number;
  @Column({ name: 'inventory_adjustment_id', type: 'bigint' }) inventoryAdjustmentId!: number;
  @ManyToOne(() => InventoryAdjustment, adjustment => adjustment.lines, { nullable: false, onDelete: 'CASCADE' }) @JoinColumn({ name: 'inventory_adjustment_id' }) inventoryAdjustment!: InventoryAdjustment;
  @Column({ name: 'product_id', type: 'bigint' }) productId!: number;
  @ManyToOne(() => Product, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'product_id' }) product!: Product;
  @Column({ name: 'product_unit_id', type: 'bigint' }) productUnitId!: number;
  @ManyToOne(() => ProductUnit, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'product_unit_id' }) productUnit!: ProductUnit;
  @Column({ name: 'conversion_factor_snapshot', type: 'decimal', precision: 18, scale: 6 }) conversionFactorSnapshot!: string;
  @Column({ type: 'decimal', precision: 18, scale: 4 }) quantity!: string;
  @Column({ name: 'base_quantity', type: 'decimal', precision: 18, scale: 4 }) baseQuantity!: string;
  @Column({ name: 'unit_cost', type: 'decimal', precision: 18, scale: 4, nullable: true }) unitCost!: string | null;
  @Column({ name: 'inventory_value', type: 'decimal', precision: 18, scale: 4, nullable: true }) inventoryValue!: string | null;
  @Column({ name: 'quantity_before', type: 'decimal', precision: 18, scale: 4, nullable: true }) quantityBefore!: string | null;
  @Column({ name: 'quantity_after', type: 'decimal', precision: 18, scale: 4, nullable: true }) quantityAfter!: string | null;
  @Column({ type: 'text', nullable: true }) remarks!: string | null;
}
