import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Tenant } from '../tenants/tenant.entity';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { UserLocation } from '../user-locations/user-locations.entity';
import { GoodsReceipt } from '../goods-receipts/goods-receipt.entity';
import { InventoryAgeLayer } from '../inventory-age-layers/inventory-age-layer.entity';
import { InventoryBalance } from '../inventory-balance/inventory-balance.entity';
import { InventoryLedger } from '../inventory-ledger/inventory-ledger.entity';
import { PurchaseOrder } from '../purchase-orders/purchase-order.entity';
export enum LocationType {
  HEAD_OFFICE = 'HEAD_OFFICE',
  WAREHOUSE = 'WAREHOUSE',
  STORE = 'STORE',
  DISTRIBUTION_CENTER = 'DISTRIBUTION_CENTER',
  OFFICE = 'OFFICE',
  OTHER = 'OTHER',
}
@Entity('tbl_location')
export class Location extends AuditEntity {
  @PrimaryGeneratedColumn({name:'location_id',type:'bigint'}) locationId!: number;
  @Column({name:'tenant_id',type:'bigint'}) tenantId!: number;
  @ManyToOne(() => Tenant, (tenant) => tenant.locations, {nullable:false}) @JoinColumn({name:'tenant_id'}) tenant!: Tenant;
  @Column({name:'code',type:'varchar',length:50}) code!: string;
  @Column({name:'name',type:'varchar',length:150}) name!: string;
  @Column({name:'location_type',type:'varchar',length:50}) locationType!: LocationType;
  @Column({name:'contact_person',type:'varchar',length:150,nullable:true}) contactPerson!: string | null;
  @Column({name:'email',type:'varchar',length:150,nullable:true}) email!: string | null;
  @Column({name:'phone',type:'varchar',length:50,nullable:true}) phone!: string | null;
  @Column({name:'address_line1',type:'varchar',length:200,nullable:true}) addressLine1!: string | null;
  @Column({name:'address_line2',type:'varchar',length:200,nullable:true}) addressLine2!: string | null;
  @Column({name:'city',type:'varchar',length:100,nullable:true}) city!: string | null;
  @Column({name:'state_province',type:'varchar',length:100,nullable:true}) stateProvince!: string | null;
  @Column({name:'postal_code',type:'varchar',length:30,nullable:true}) postalCode!: string | null;
  @Column({name:'country_code',type:'varchar',length:2,nullable:true}) countryCode!: string | null;
  @Column({name:'is_active',default:true}) isActive!: boolean;
  @OneToMany(() => ProductLocation, (productLocation) => productLocation.location) productLocations!: ProductLocation[];
  @OneToMany(() => UserLocation, (userLocation) => userLocation.location) userLocations!: UserLocation[];
  @OneToMany(() => PurchaseOrder, (purchaseOrder) => purchaseOrder.location) purchaseOrders!: PurchaseOrder[];
  @OneToMany(() => GoodsReceipt, (goodsReceipt) => goodsReceipt.location) goodsReceipts!: GoodsReceipt[];
  @OneToMany(() => InventoryBalance, (balance) => balance.location) inventoryBalances!: InventoryBalance[];
  @OneToMany(() => InventoryLedger, (ledger) => ledger.location) inventoryLedgers!: InventoryLedger[];
  @OneToMany(() => InventoryAgeLayer, (layer) => layer.location) inventoryAgeLayers!: InventoryAgeLayer[];
}
