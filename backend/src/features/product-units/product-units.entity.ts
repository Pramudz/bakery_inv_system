import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Product } from '../products/products.entity';
import { UnitOfMeasure } from '../units/units.entity';
@Entity('tbl_product_unit')
@Unique('uq_product_unit_product_unit', ['productId', 'unitId'])
export class ProductUnit extends AuditEntity {
  @PrimaryGeneratedColumn({name:'product_unit_id',type:'bigint'}) productUnitId!: number;
  @Column({name:'product_id',type:'bigint'}) productId!: number;
  @ManyToOne(() => Product, (product) => product.productUnits, {nullable:false}) @JoinColumn({name:'product_id'}) product!: Product;
  @Column({name:'unit_id',type:'bigint'}) unitId!: number;
  @ManyToOne(() => UnitOfMeasure, (unit) => unit.productUnits, {nullable:false}) @JoinColumn({name:'unit_id'}) unit!: UnitOfMeasure;
  @Column({name:'conversion_factor',type:'decimal',precision:18,scale:6,default:1}) conversionFactor!: string;
  @Column({name:'is_base_unit',default:false}) isBaseUnit!: boolean;
  @Column({name:'is_purchase_unit',default:false}) isPurchaseUnit!: boolean;
  @Column({name:'is_sales_unit',default:false}) isSalesUnit!: boolean;
  @Column({name:'is_active',default:true}) isActive!: boolean;
}
