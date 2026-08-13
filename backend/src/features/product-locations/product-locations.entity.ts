import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Product } from '../products/products.entity';
import { Location } from '../locations/locations.entity';
@Entity('tbl_product_location')
export class ProductLocation extends AuditEntity {
  @PrimaryGeneratedColumn({name:'product_location_id',type:'bigint'}) productLocationId!: number;
  @Column({name:'product_id',type:'bigint'}) productId!: number;
  @ManyToOne(() => Product, (product) => product.productLocations, {nullable:false}) @JoinColumn({name:'product_id'}) product!: Product;
  @Column({name:'location_id',type:'bigint'}) locationId!: number;
  @ManyToOne(() => Location, (location) => location.productLocations, {nullable:false}) @JoinColumn({name:'location_id'}) location!: Location;
  @Column({name:'is_active',default:true}) isActive!: boolean;
  @Column({name:'is_sellable',default:true}) isSellable!: boolean;
  @Column({name:'is_purchasable',default:true}) isPurchasable!: boolean;
}
