import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { ProductSupplier } from '../product-suppliers/product-suppliers.entity';
import { ProductUnit } from '../product-units/product-units.entity';
@Entity('tbl_product_supplier_price')
export class ProductSupplierPrice extends AuditEntity {
  @PrimaryGeneratedColumn({name:'product_supplier_price_id',type:'bigint'}) productSupplierPriceId!: number;
  @Column({name:'product_supplier_id',type:'bigint'}) productSupplierId!: number;
  @ManyToOne(() => ProductSupplier, (productSupplier) => productSupplier.prices, {nullable:false}) @JoinColumn({name:'product_supplier_id'}) productSupplier!: ProductSupplier;
  @Column({name:'product_unit_id',type:'bigint'}) productUnitId!: number;
  @ManyToOne(() => ProductUnit, (productUnit) => productUnit.supplierPrices, {nullable:false}) @JoinColumn({name:'product_unit_id'}) productUnit!: ProductUnit;
  @Column({name:'purchase_price',type:'decimal',precision:18,scale:4}) purchasePrice!: string;
  @Column({name:'currency_code',type:'varchar',length:3,default:'LKR'}) currencyCode!: string;
  @Column({name:'minimum_quantity',type:'decimal',precision:18,scale:6,default:1}) minimumQuantity!: string;
  @Column({name:'effective_from',type:'datetime'}) effectiveFrom!: Date;
  @Column({name:'effective_to',type:'datetime',nullable:true}) effectiveTo!: Date|null;
  @Column({name:'is_active',default:true}) isActive!: boolean;
}
