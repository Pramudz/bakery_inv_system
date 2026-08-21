import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Tenant } from '../tenants/tenant.entity';
import { ProductSupplier } from '../product-suppliers/product-suppliers.entity';
import { GoodsReceipt } from '../goods-receipts/goods-receipt.entity';
import { PurchaseOrder } from '../purchase-orders/purchase-order.entity';
@Entity('tbl_supplier')
@Unique('uq_supplier_tenant_code', ['tenantId', 'supplierCode'])
export class Supplier extends AuditEntity {
  @PrimaryGeneratedColumn({name:'supplier_id',type:'bigint'}) supplierId!: number;
  @Column({name:'tenant_id',type:'bigint'}) tenantId!: number;
  @ManyToOne(() => Tenant, (tenant) => tenant.suppliers, {nullable:false}) @JoinColumn({name:'tenant_id'}) tenant!: Tenant;
  @Column({name:'supplier_code',type:'varchar',length:50}) supplierCode!: string;
  @Column({name:'supplier_name',type:'varchar',length:200}) supplierName!: string;
  @Column({name:'contact_name',type:'varchar',length:150,nullable:true}) contactName!: string|null;
  @Column({name:'phone',type:'varchar',length:50,nullable:true}) phone!: string|null;
  @Column({name:'mobile',type:'varchar',length:50,nullable:true}) mobile!: string|null;
  @Column({name:'email',type:'varchar',length:150,nullable:true}) email!: string|null;
  @Column({name:'address_line1',type:'varchar',length:255,nullable:true}) addressLine1!: string|null;
  @Column({name:'address_line2',type:'varchar',length:255,nullable:true}) addressLine2!: string|null;
  @Column({name:'city',type:'varchar',length:100,nullable:true}) city!: string|null;
  @Column({name:'district_or_state',type:'varchar',length:100,nullable:true}) districtOrState!: string|null;
  @Column({name:'postal_code',type:'varchar',length:30,nullable:true}) postalCode!: string|null;
  @Column({name:'country_code',type:'varchar',length:2,nullable:true}) countryCode!: string|null;
  @Column({name:'is_active',default:true}) isActive!: boolean;
  @OneToMany(() => ProductSupplier, (productSupplier) => productSupplier.supplier) productSuppliers!: ProductSupplier[];
  @OneToMany(() => PurchaseOrder, (purchaseOrder) => purchaseOrder.supplier) purchaseOrders!: PurchaseOrder[];
  @OneToMany(() => GoodsReceipt, (goodsReceipt) => goodsReceipt.supplier) goodsReceipts!: GoodsReceipt[];
}
