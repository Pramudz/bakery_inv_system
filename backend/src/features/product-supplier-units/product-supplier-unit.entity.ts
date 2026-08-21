import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  OneToMany,
} from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { ProductSupplier } from '../product-suppliers/product-suppliers.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { ProductSupplierPrice } from '../product-supplier-prices/product-supplier-price.entity';

@Entity('tbl_product_supplier_unit')
@Unique('uq_product_supplier_unit_supplier_unit', [
  'productSupplierId',
  'productUnitId',
])
export class ProductSupplierUnit extends AuditEntity {
  @PrimaryGeneratedColumn({
    name: 'product_supplier_unit_id',
    type: 'bigint',
  })
  productSupplierUnitId!: number;

  @Column({ name: 'product_supplier_id', type: 'bigint' })
  productSupplierId!: number;

   @ManyToOne(
    () => ProductSupplier,
    (productSupplier) => productSupplier.supplierUnits,
    { nullable: false },
  )
  @JoinColumn({ name: 'product_supplier_id' })
  productSupplier!: ProductSupplier;

  @Column({ name: 'product_unit_id', type: 'bigint' })
  productUnitId!: number;

  @ManyToOne(() => ProductUnit, { nullable: false })
  @JoinColumn({ name: 'product_unit_id' })
  productUnit!: ProductUnit;

  @Column({
    name: 'supplier_product_code',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  supplierProductCode!: string | null;

  @Column({
    name: 'minimum_order_qty',
    type: 'decimal',
    precision: 18,
    scale: 6,
    nullable: true,
  })
  minimumOrderQty!: string | null;

  @Column({ name: 'lead_time_days', type: 'int', nullable: true })
  leadTimeDays!: number | null;

  @Column({ name: 'is_default_purchase_unit', default: false })
  isDefaultPurchaseUnit!: boolean;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

   @OneToMany(
    () => ProductSupplierPrice,
    (price) => price.productSupplierUnit,
  )
   prices!: ProductSupplierPrice[];
}