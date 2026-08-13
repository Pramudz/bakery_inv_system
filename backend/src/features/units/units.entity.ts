import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Tenant } from '../tenants/tenant.entity';
import { Product } from '../products/products.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { PriceListItem } from '../price-list-items/price-list-items.entity';
@Entity('tbl_unit_of_measure')
export class UnitOfMeasure extends AuditEntity {
  @PrimaryGeneratedColumn({name:'unit_id',type:'bigint'}) unitId!: number;
  @Column({name:'tenant_id',type:'bigint'}) tenantId!: number;
  @ManyToOne(() => Tenant, (tenant) => tenant.units, {nullable:false}) @JoinColumn({name:'tenant_id'}) tenant!: Tenant;
  @Column({name:'code',type:'varchar',length:30}) code!: string;
  @Column({name:'name',type:'varchar',length:100}) name!: string;
  @Column({name:'symbol',type:'varchar',length:20,nullable:true}) symbol!: string|null;
  @Column({name:'unit_type',type:'varchar',length:50}) unitType!: string;
  @Column({name:'is_active',default:true}) isActive!: boolean;
  @OneToMany(() => Product, (product) => product.baseUnit) baseProducts!: Product[];
  @OneToMany(() => ProductUnit, (productUnit) => productUnit.unit) productUnits!: ProductUnit[];
  @OneToMany(() => PriceListItem, (item) => item.unit) priceListItems!: PriceListItem[];
}
