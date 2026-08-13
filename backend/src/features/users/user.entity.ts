import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Tenant } from '../tenants/tenant.entity';
import { UserRole } from '../user-roles/user-roles.entity';
import { UserSession } from '../user-sessions/user-sessions.entity';
import { UserLocation } from '../user-locations/user-locations.entity';
import { GoodsReceipt, InventoryLedger, PurchaseOrder } from '../purchasing/purchasing.entities';

@Entity('tbl_user')
export class User extends AuditEntity {
  @PrimaryGeneratedColumn({ name:'user_id', type:'bigint' }) userId!: number;
  @Column({ name:'tenant_id', type:'bigint' }) tenantId!: number;
  @ManyToOne(() => Tenant, (tenant) => tenant.users, { nullable: false })
  @JoinColumn({ name:'tenant_id' }) tenant!: Tenant;
  @Column({ name:'username', type:'varchar', length:100 }) username!: string;
  @Column({ name:'email', type:'varchar', length:150, nullable:true }) email!: string|null;
  @Column({ name:'password_hash', type:'varchar', length:255, select:false }) passwordHash!: string;
  @Column({ name:'first_name', type:'varchar', length:100, nullable:true }) firstName!: string|null;
  @Column({ name:'last_name', type:'varchar', length:100, nullable:true }) lastName!: string|null;
  @Column({ name:'mobile', type:'varchar', length:30, nullable:true }) mobile!: string|null;
  @Column({ name:'is_active', default:true }) isActive!: boolean;
  @Column({ name:'last_login_at', type:'datetime', nullable:true }) lastLoginAt!: Date|null;
  @OneToMany(() => UserRole, (userRole) => userRole.user) userRoles!: UserRole[];
  @OneToMany(() => UserSession, (session) => session.user) sessions!: UserSession[];
  @OneToMany(() => UserLocation, (userLocation) => userLocation.user) userLocations!: UserLocation[];
  @OneToMany(() => PurchaseOrder, (purchaseOrder) => purchaseOrder.createdByUser) createdPurchaseOrders!: PurchaseOrder[];
  @OneToMany(() => PurchaseOrder, (purchaseOrder) => purchaseOrder.approvedByUser) approvedPurchaseOrders!: PurchaseOrder[];
  @OneToMany(() => PurchaseOrder, (purchaseOrder) => purchaseOrder.cancelledByUser) cancelledPurchaseOrders!: PurchaseOrder[];
  @OneToMany(() => GoodsReceipt, (goodsReceipt) => goodsReceipt.createdByUser) createdGoodsReceipts!: GoodsReceipt[];
  @OneToMany(() => GoodsReceipt, (goodsReceipt) => goodsReceipt.postedByUser) postedGoodsReceipts!: GoodsReceipt[];
  @OneToMany(() => GoodsReceipt, (goodsReceipt) => goodsReceipt.cancelledByUser) cancelledGoodsReceipts!: GoodsReceipt[];
  @OneToMany(() => InventoryLedger, (ledger) => ledger.createdByUser) inventoryLedgers!: InventoryLedger[];
}
