import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { Product } from '../products/products.entity';
import { InventoryConversion } from './inventory-conversion.entity';

export type InventoryConversionMovement = 'AVAL' | 'AVIN';

@Entity('tbl_inventory_conversion_line')
@Unique('uq_inventory_conversion_line_side_product', ['inventoryConversionId', 'movementType', 'productId'])
export class InventoryConversionLine extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'inventory_conversion_line_id', type: 'bigint' }) inventoryConversionLineId!: number;
  @Column({ name: 'inventory_conversion_id', type: 'bigint' }) inventoryConversionId!: number;
  @ManyToOne(() => InventoryConversion, conversion => conversion.lines, { nullable: false, onDelete: 'CASCADE' }) @JoinColumn({ name: 'inventory_conversion_id' }) inventoryConversion!: InventoryConversion;
  @Column({ name: 'movement_type', type: 'varchar', length: 10 }) movementType!: InventoryConversionMovement;
  @Column({ name: 'product_id', type: 'bigint' }) productId!: number;
  @ManyToOne(() => Product, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'product_id' }) product!: Product;
  @Column({ name: 'product_unit_id', type: 'bigint' }) productUnitId!: number;
  @ManyToOne(() => ProductUnit, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'product_unit_id' }) productUnit!: ProductUnit;
  @Column({ name: 'conversion_factor_snapshot', type: 'decimal', precision: 18, scale: 6 }) conversionFactorSnapshot!: string;
  @Column({ type: 'decimal', precision: 18, scale: 4 }) quantity!: string;
  @Column({ name: 'base_quantity', type: 'decimal', precision: 18, scale: 4 }) baseQuantity!: string;
  @Column({ name: 'quantity_before', type: 'decimal', precision: 18, scale: 4, nullable: true }) quantityBefore!: string | null;
  @Column({ name: 'quantity_after', type: 'decimal', precision: 18, scale: 4, nullable: true }) quantityAfter!: string | null;
  @Column({ name: 'wavg_before', type: 'decimal', precision: 18, scale: 4, nullable: true }) wavgBefore!: string | null;
  @Column({ name: 'wavg_after', type: 'decimal', precision: 18, scale: 4, nullable: true }) wavgAfter!: string | null;
  @Column({ name: 'posted_unit_cost', type: 'decimal', precision: 18, scale: 4, nullable: true }) postedUnitCost!: string | null;
  @Column({ name: 'posted_value', type: 'decimal', precision: 18, scale: 4, nullable: true }) postedValue!: string | null;
  @Column({ name: 'allocation_percent', type: 'decimal', precision: 9, scale: 4, nullable: true }) allocationPercent!: string | null;
  @Column({ name: 'allocation_basis_value', type: 'decimal', precision: 18, scale: 4, nullable: true }) allocationBasisValue!: string | null;
  @Column({ name: 'allocated_value', type: 'decimal', precision: 18, scale: 4, nullable: true }) allocatedValue!: string | null;
  @Column({ name: 'allocation_weight', type: 'decimal', precision: 18, scale: 4, nullable: true }) allocationWeight!: string | null;
  @Column({ type: 'text', nullable: true }) remarks!: string | null;
}
