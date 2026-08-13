import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Tenant } from '../tenants/tenant.entity';
import { Product } from '../products/products.entity';
@Entity('tbl_brand')
export class Brand extends AuditEntity {
  @PrimaryGeneratedColumn({ name:'brand_id', type:'bigint' }) brandId!: number;
  @Column({name:'tenant_id',type:'bigint'}) tenantId!: number;
  @ManyToOne(() => Tenant, (tenant) => tenant.brands, { nullable:false }) @JoinColumn({name:'tenant_id'}) tenant!: Tenant;
  @Column({name:'brand_code',type:'varchar',length:50}) brandCode!: string;
  @Column({name:'brand_name',type:'varchar',length:150}) brandName!: string;
  @Column({name:'description',type:'varchar',length:255,nullable:true}) description!: string|null;
  @Column({name:'is_active',default:true}) isActive!: boolean;
  @OneToMany(() => Product, (product) => product.brand) products!: Product[];
}
