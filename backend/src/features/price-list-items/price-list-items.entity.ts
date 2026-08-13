import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { PriceList } from '../price-lists/price-lists.entity';
import { Product } from '../products/products.entity';
import { UnitOfMeasure } from '../units/units.entity';
@Entity('tbl_price_list_item')
export class PriceListItem extends AuditEntity {
  @PrimaryGeneratedColumn({name:'price_list_item_id',type:'bigint'}) priceListItemId!: number;
  @Column({name:'price_list_id',type:'bigint'}) priceListId!: number;
  @ManyToOne(() => PriceList, (priceList) => priceList.items, {nullable:false}) @JoinColumn({name:'price_list_id'}) priceList!: PriceList;
  @Column({name:'product_id',type:'bigint'}) productId!: number;
  @ManyToOne(() => Product, (product) => product.priceListItems, {nullable:false}) @JoinColumn({name:'product_id'}) product!: Product;
  @Column({name:'unit_id',type:'bigint'}) unitId!: number;
  @ManyToOne(() => UnitOfMeasure, (unit) => unit.priceListItems, {nullable:false}) @JoinColumn({name:'unit_id'}) unit!: UnitOfMeasure;
  @Column({name:'selling_price',type:'decimal',precision:18,scale:4}) sellingPrice!: string;
  @Column({name:'minimum_quantity',type:'decimal',precision:18,scale:6,default:1}) minimumQuantity!: string;
  @Column({name:'effective_from',type:'datetime'}) effectiveFrom!: Date;
  @Column({name:'effective_to',type:'datetime',nullable:true}) effectiveTo!: Date|null;
  @Column({name:'is_active',default:true}) isActive!: boolean;
}
