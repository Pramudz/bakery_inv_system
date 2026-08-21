import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { PriceList } from '../price-lists/price-lists.entity';
import { Product } from '../products/products.entity';
import { UnitOfMeasure } from '../units/units.entity';
import { Tenant } from '../tenants/tenant.entity';
import { ProductUnit } from '../product-units/product-units.entity';
@Entity('tbl_price_list_item')
@Index('idx_price_list_item_currency_effective_context', ['productId', 'priceListId', 'unitId', 'currencyCode', 'minimumQuantity', 'effectiveFrom'])
@Index('idx_selling_price_tenant_context', ['tenantId', 'productId', 'priceListId', 'productUnitId', 'minimumQuantity', 'effectiveFrom'])
export class PriceListItem extends AuditEntity {
  @PrimaryGeneratedColumn({name:'price_list_item_id',type:'bigint'}) priceListItemId!: number;
  @Column({name:'tenant_id',type:'bigint'}) tenantId!: number;
  @ManyToOne(() => Tenant, {nullable:false}) @JoinColumn({name:'tenant_id'}) tenant!: Tenant;
  @Column({name:'price_list_id',type:'bigint'}) priceListId!: number;
  @ManyToOne(() => PriceList, (priceList) => priceList.items, {nullable:false}) @JoinColumn({name:'price_list_id'}) priceList!: PriceList;
  @Column({name:'product_id',type:'bigint'}) productId!: number;
  @ManyToOne(() => Product, (product) => product.priceListItems, {nullable:false}) @JoinColumn({name:'product_id'}) product!: Product;
  @Column({name:'unit_id',type:'bigint'}) unitId!: number;
  @ManyToOne(() => UnitOfMeasure, (unit) => unit.priceListItems, {nullable:false}) @JoinColumn({name:'unit_id'}) unit!: UnitOfMeasure;
  @Column({name:'product_unit_id',type:'bigint'}) productUnitId!: number;
  @ManyToOne(() => ProductUnit, {nullable:false, onDelete:'RESTRICT'}) @JoinColumn({name:'product_unit_id'}) productUnit!: ProductUnit;
  @Column({name:'selling_price',type:'decimal',precision:18,scale:4}) sellingPrice!: string;
  @Column({name:'currency_code',type:'varchar',length:3,default:'LKR'}) currencyCode!: string;
  @Column({name:'minimum_quantity',type:'decimal',precision:18,scale:6,default:1}) minimumQuantity!: string;
  @Column({name:'effective_from',type:'datetime',precision:3}) effectiveFrom!: Date;
  @Column({name:'effective_to',type:'datetime',precision:3,nullable:true}) effectiveTo!: Date|null;
  @Column({name:'is_active',default:true}) isActive!: boolean;
}
