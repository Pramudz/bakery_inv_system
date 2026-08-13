import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Tenant } from '../tenants/tenant.entity';
import { PriceListItem } from '../price-list-items/price-list-items.entity';
@Entity('tbl_price_list')
export class PriceList extends AuditEntity {
  @PrimaryGeneratedColumn({name:'price_list_id',type:'bigint'}) priceListId!: number;
  @Column({name:'tenant_id',type:'bigint'}) tenantId!: number;
  @ManyToOne(() => Tenant, (tenant) => tenant.priceLists, {nullable:false}) @JoinColumn({name:'tenant_id'}) tenant!: Tenant;
  @Column({name:'code',type:'varchar',length:50}) code!: string;
  @Column({name:'name',type:'varchar',length:150}) name!: string;
  @Column({name:'price_list_type',type:'varchar',length:50}) priceListType!: string;
  @Column({name:'currency_code',type:'varchar',length:3,default:'LKR'}) currencyCode!: string;
  @Column({name:'is_default',default:false}) isDefault!: boolean;
  @Column({name:'is_active',default:true}) isActive!: boolean;
  @OneToMany(() => PriceListItem, (item) => item.priceList) items!: PriceListItem[];
}
