import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Tenant } from '../tenants/tenant.entity';
import { Product } from '../products/products.entity';
@Entity('tbl_category')
export class Category extends AuditEntity {
  @PrimaryGeneratedColumn({ name:'category_id', type:'bigint' }) categoryId!: number;
  @Column({name:'tenant_id',type:'bigint'}) tenantId!: number;
  @ManyToOne(() => Tenant, (tenant) => tenant.categories, { nullable:false }) @JoinColumn({name:'tenant_id'}) tenant!: Tenant;
  @Column({name:'parent_category_id',type:'bigint',nullable:true}) parentCategoryId!: number|null;
  @ManyToOne(() => Category, (category) => category.children, { nullable:true }) @JoinColumn({name:'parent_category_id'}) parentCategory!: Category|null;
  @OneToMany(() => Category, (category) => category.parentCategory) children!: Category[];
  @Column({name:'category_code',type:'varchar',length:50}) categoryCode!: string;
  @Column({name:'category_name',type:'varchar',length:150}) categoryName!: string;
  @Column({name:'description',type:'varchar',length:255,nullable:true}) description!: string|null;
  @Column({name:'sort_order',type:'int',nullable:true}) sortOrder!: number|null;
  @Column({name:'is_active',default:true}) isActive!: boolean;
  @OneToMany(() => Product, (product) => product.category) products!: Product[];
}
