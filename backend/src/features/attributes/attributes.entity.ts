import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Tenant } from '../tenants/tenant.entity';
import { ProductAttributes } from '../product-attributes/product-attributes.entity';
@Entity('tbl_attribute')
export class Attribute extends AuditEntity {
  @PrimaryGeneratedColumn({name:'attribute_id',type:'bigint'}) attributeId!: number;
  @Column({name:'tenant_id',type:'bigint'}) tenantId!: number;
  @ManyToOne(() => Tenant, (tenant) => tenant.attributes, {nullable:false}) @JoinColumn({name:'tenant_id'}) tenant!: Tenant;
  @Column({name:'code',type:'varchar',length:50}) code!: string;
  @Column({name:'name',type:'varchar',length:100}) name!: string;
  @Column({name:'data_type',type:'varchar',length:30}) dataType!: string;
  @Column({name:'is_active',default:true}) isActive!: boolean;
  @OneToMany(() => ProductAttributes, (productAttribute) => productAttribute.attribute) productAttributes!: ProductAttributes[];
}
