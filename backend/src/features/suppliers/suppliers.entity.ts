import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Tenant } from '../tenants/tenant.entity';
import { ProductSupplier } from '../product-suppliers/product-suppliers.entity';
@Entity('tbl_supplier')
export class Supplier extends AuditEntity {
  @PrimaryGeneratedColumn({name:'supplier_id',type:'bigint'}) supplierId!: number;
  @Column({name:'tenant_id',type:'bigint'}) tenantId!: number;
  @ManyToOne(() => Tenant, (tenant) => tenant.suppliers, {nullable:false}) @JoinColumn({name:'tenant_id'}) tenant!: Tenant;
  @Column({name:'supplier_code',type:'varchar',length:50}) supplierCode!: string;
  @Column({name:'supplier_name',type:'varchar',length:200}) supplierName!: string;
  @Column({name:'contact_name',type:'varchar',length:150,nullable:true}) contactName!: string|null;
  @Column({name:'phone',type:'varchar',length:30,nullable:true}) phone!: string|null;
  @Column({name:'email',type:'varchar',length:150,nullable:true}) email!: string|null;
  @Column({name:'address_line_1',type:'varchar',length:255,nullable:true}) addressLine1!: string|null;
  @Column({name:'address_line_2',type:'varchar',length:255,nullable:true}) addressLine2!: string|null;
  @Column({name:'city',type:'varchar',length:100,nullable:true}) city!: string|null;
  @Column({name:'is_active',default:true}) isActive!: boolean;
  @OneToMany(() => ProductSupplier, (productSupplier) => productSupplier.supplier) productSuppliers!: ProductSupplier[];
}
