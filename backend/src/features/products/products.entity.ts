import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn , Unique } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Tenant } from '../tenants/tenant.entity';
import { Category } from '../categories/categories.entity';
import { Brand } from '../brands/brands.entity';
import { UnitOfMeasure } from '../units/units.entity';
import { ProductIdentifier } from '../product-identifiers/product-identifiers.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { ProductSupplier } from '../product-suppliers/product-suppliers.entity';
import { PriceListItem } from '../price-list-items/price-list-items.entity';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { ProductAttributes } from '../product-attributes/product-attributes.entity';
import { GoodsReceiptLine } from '../goods-receipts/goods-receipt-line.entity';
import { InventoryAgeLayer } from '../inventory-age-layers/inventory-age-layer.entity';
import { InventoryBalance } from '../inventory-balance/inventory-balance.entity';
import { InventoryLedger } from '../inventory-ledger/inventory-ledger.entity';
import { PurchaseOrderLine } from '../purchase-orders/purchase-order-line.entity';
import { ProductImage } from '../product-images/product-image.entity';

@Entity('tbl_product')
@Unique('uq_product_tenant_sku', ['tenantId', 'sku'])
export class Product extends AuditEntity {
  @PrimaryGeneratedColumn({name:'product_id',type:'bigint'}) productId!: number;
  @Column({name:'tenant_id',type:'bigint'}) tenantId!: number;
  @ManyToOne(() => Tenant, (tenant) => tenant.products, {nullable:false}) @JoinColumn({name:'tenant_id'}) tenant!: Tenant;
  @Column({name:'sku',type:'varchar',length:100}) sku!: string;
  @Column({name:'product_name',type:'varchar',length:255}) productName!: string;
  @Column({name:'description',type:'text',nullable:true}) description!: string|null;
  @Column({name:'product_type',type:'varchar',length:50,default:'STOCK'}) productType!: string;
  @Column({name:'category_id',type:'bigint'}) categoryId!: number;
  @ManyToOne(() => Category, (category) => category.products, {nullable:false}) @JoinColumn({name:'category_id'}) category!: Category;
  @Column({name:'brand_id',type:'bigint',nullable:true}) brandId!: number|null;
  @ManyToOne(() => Brand, (brand) => brand.products, {nullable:true}) @JoinColumn({name:'brand_id'}) brand!: Brand|null;
  @Column({name:'base_unit_id',type:'bigint'}) baseUnitId!: number;
  @ManyToOne(() => UnitOfMeasure, (unit) => unit.baseProducts, {nullable:false}) @JoinColumn({name:'base_unit_id'}) baseUnit!: UnitOfMeasure;
  @Column({name:'is_active',default:true}) isActive!: boolean;
  @Column({name:'is_sellable',default:true}) isSellable!: boolean;
  @Column({name:'is_purchasable',default:true}) isPurchasable!: boolean;
  @Column({name:'is_stock_item',default:true}) isStockItem!: boolean;
  @Column({name:'track_batch',default:false}) trackBatch!: boolean;
  @Column({name:'track_expiry',default:false}) trackExpiry!: boolean;
  @Column({name:'track_serial',default:false}) trackSerial!: boolean;
  @OneToMany(() => ProductIdentifier, (identifier) => identifier.product) identifiers!: ProductIdentifier[];
  @OneToMany(() => ProductUnit, (productUnit) => productUnit.product) productUnits!: ProductUnit[];
  @OneToMany(() => ProductSupplier, (productSupplier) => productSupplier.product) productSuppliers!: ProductSupplier[];
  @OneToMany(() => PriceListItem, (item) => item.product) priceListItems!: PriceListItem[];
  @OneToMany(() => ProductLocation, (location) => location.product) productLocations!: ProductLocation[];
  @OneToMany(() => ProductAttributes, (attribute) => attribute.product) productAttributes!: ProductAttributes[];
  @OneToMany(() => ProductImage, (image) => image.product) productImages!: ProductImage[];
  @OneToMany(() => PurchaseOrderLine, (line) => line.product) purchaseOrderLines!: PurchaseOrderLine[];
  @OneToMany(() => GoodsReceiptLine, (line) => line.product) goodsReceiptLines!: GoodsReceiptLine[];
  @OneToMany(() => InventoryBalance, (balance) => balance.product) inventoryBalances!: InventoryBalance[];
  @OneToMany(() => InventoryLedger, (ledger) => ledger.product) inventoryLedgers!: InventoryLedger[];
  @OneToMany(() => InventoryAgeLayer, (layer) => layer.product) inventoryAgeLayers!: InventoryAgeLayer[];
}
