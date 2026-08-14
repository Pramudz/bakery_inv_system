import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { User } from '../users/user.entity';
import { Role } from '../roles/roles.entity';
import { Category } from '../categories/categories.entity';
import { Brand } from '../brands/brands.entity';
import { UnitOfMeasure } from '../units/units.entity';
import { Product } from '../products/products.entity';
import { Supplier } from '../suppliers/suppliers.entity';
import { PriceList } from '../price-lists/price-lists.entity';
import { Location } from '../locations/locations.entity';
import { Attribute } from '../attributes/attributes.entity';
import { UserLocation } from '../user-locations/user-locations.entity';
import { TenantModule } from '../tenant-modules/tenant-modules.entity';
import { GoodsReceipt } from '../goods-receipts/goods-receipt.entity';
import { InventoryAgeLayer } from '../inventory-age-layers/inventory-age-layer.entity';
import { InventoryBalance } from '../inventory-balance/inventory-balance.entity';
import { InventoryLedger } from '../inventory-ledger/inventory-ledger.entity';
import { PurchaseOrder } from '../purchase-orders/purchase-order.entity';

@Entity('tbl_tenant')
export class Tenant extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @Column({ name: 'tenant_code', type: 'varchar', length: 50, unique: true }) tenantCode!: string;
  @Column({ name: 'tenant_name', type: 'varchar', length: 150 }) tenantName!: string;
  @Column({ name: 'tenant_is_active', default: true }) tenantIsActive!: boolean;
  @Column({ name: 'allow_direct_grn', default: true }) allowDirectGrn!: boolean;
  @Column({ name: 'po_required_for_grn', default: false }) poRequiredForGrn!: boolean;

  @OneToMany(() => User, (user) => user.tenant) users!: User[];
  @OneToMany(() => Role, (role) => role.tenant) roles!: Role[];
  @OneToMany(() => Category, (category) => category.tenant) categories!: Category[];
  @OneToMany(() => Brand, (brand) => brand.tenant) brands!: Brand[];
  @OneToMany(() => UnitOfMeasure, (unit) => unit.tenant) units!: UnitOfMeasure[];
  @OneToMany(() => Product, (product) => product.tenant) products!: Product[];
  @OneToMany(() => Supplier, (supplier) => supplier.tenant) suppliers!: Supplier[];
  @OneToMany(() => PriceList, (priceList) => priceList.tenant) priceLists!: PriceList[];
  @OneToMany(() => Location, (location) => location.tenant) locations!: Location[];
  @OneToMany(() => Attribute, (attribute) => attribute.tenant) attributes!: Attribute[];
  @OneToMany(() => UserLocation, (userLocation) => userLocation.tenant) userLocations!: UserLocation[];
  @OneToMany(() => TenantModule, (tenantModule) => tenantModule.tenant) tenantModules!: TenantModule[];
  @OneToMany(() => PurchaseOrder, (purchaseOrder) => purchaseOrder.tenant) purchaseOrders!: PurchaseOrder[];
  @OneToMany(() => GoodsReceipt, (goodsReceipt) => goodsReceipt.tenant) goodsReceipts!: GoodsReceipt[];
  @OneToMany(() => InventoryBalance, (balance) => balance.tenant) inventoryBalances!: InventoryBalance[];
  @OneToMany(() => InventoryLedger, (ledger) => ledger.tenant) inventoryLedgers!: InventoryLedger[];
  @OneToMany(() => InventoryAgeLayer, (layer) => layer.tenant) inventoryAgeLayers!: InventoryAgeLayer[];
}
