import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Product } from '../products/products.entity';
import { Supplier } from '../suppliers/suppliers.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { ProductSupplierPrice } from '../product-supplier-prices/product-supplier-price.entity';
@Entity('tbl_product_supplier')
export class ProductSupplier extends AuditEntity {
  @PrimaryGeneratedColumn({name:'product_supplier_id',type:'bigint'}) productSupplierId!: number;
  @Column({name:'product_id',type:'bigint'}) productId!: number;
  @ManyToOne(() => Product, (product) => product.productSuppliers, {nullable:false}) @JoinColumn({name:'product_id'}) product!: Product;
  @Column({name:'supplier_id',type:'bigint'}) supplierId!: number;
  @ManyToOne(() => Supplier, (supplier) => supplier.productSuppliers, {nullable:false}) @JoinColumn({name:'supplier_id'}) supplier!: Supplier;
  @Column({name:'supplier_product_code',type:'varchar',length:100,nullable:true}) supplierProductCode!: string|null;
  @Column({name:'purchase_unit_id',type:'bigint',nullable:true}) purchaseUnitId!: number|null;
  @ManyToOne(() => ProductUnit, (productUnit) => productUnit.purchaseProducts, {nullable:true}) @JoinColumn({name:'purchase_unit_id'}) purchaseUnit!: ProductUnit|null;
  @Column({name:'minimum_order_qty',type:'decimal',precision:18,scale:6,nullable:true}) minimumOrderQty!: string|null;
  @Column({name:'lead_time_days',type:'int',nullable:true}) leadTimeDays!: number|null;
  @Column({name:'is_primary_supplier',default:false}) isPrimarySupplier!: boolean;
  @Column({name:'is_active',default:true}) isActive!: boolean;
  @OneToMany(() => ProductSupplierPrice, (price) => price.productSupplier) prices!: ProductSupplierPrice[];
}
