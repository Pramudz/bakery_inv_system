import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  Index,
} from "typeorm";
import { AuditEntity } from "../../common/audit.entity";
import { Tenant } from "../tenants/tenant.entity";
import { Location } from "../locations/locations.entity";
import { Product } from "../products/products.entity";
import { User } from "../users/user.entity";
import { InventoryAdjustmentReason } from "../inventory-adjustments/inventory-adjustment-reason.entity";
@Entity("tbl_inventory_ledger")
@Unique("uq_inventory_ledger_source_movement", ["tenantId", "sourceDocumentType", "sourceDocumentId", "sourceDocumentLineId", "movementType"])
@Index('uq_inventory_ledger_reversal', ['reversalOfLedgerId'], { unique: true })
export class InventoryLedger extends AuditEntity {
  @Column({ name: 'inventory_adjustment_reason_id', type: 'bigint', nullable: true }) inventoryAdjustmentReasonId?: number | null;
  @ManyToOne(() => InventoryAdjustmentReason, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'inventory_adjustment_reason_id' }) inventoryAdjustmentReason?: InventoryAdjustmentReason | null;
  @Column({ name: 'valuation_method', type: 'varchar', length: 40, nullable: true }) valuationMethod?: string | null;
  @Column({ name: 'original_document_value', type: 'decimal', precision: 18, scale: 4, nullable: true }) originalDocumentValue?: string | null;
  @Column({ name: 'inventory_relief_value', type: 'decimal', precision: 18, scale: 4, nullable: true }) inventoryReliefValue?: string | null;
  @Column({ name: 'cost_variance', type: 'decimal', precision: 18, scale: 4, nullable: true }) costVariance?: string | null;
  @Column({ name: 'reversal_of_ledger_id', type: 'bigint', nullable: true }) reversalOfLedgerId?: number | null;
  @ManyToOne(() => InventoryLedger, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reversal_of_ledger_id' }) reversalOfLedger?: InventoryLedger | null;
  @Column({ name: 'business_date', type: 'date', nullable: true }) businessDate?: string | null;
  // Quantities are decimal strings. Unallocated stock-outs never invent a receipt age.
  @Column({ name: 'age_layer_relief', type: 'json', nullable: true }) ageLayerRelief?: {
    allocations: Array<{ layerId: number; quantity: string; before: string; after: string }>;
    unallocatedQuantity: string;
  } | null;
  @PrimaryGeneratedColumn({ name: "inventory_ledger_id", type: "bigint" })
  inventoryLedgerId!: number;
  @Column({ name: "tenant_id", type: "bigint" }) tenantId!: number;
  @ManyToOne(() => Tenant, (x) => x.inventoryLedgers, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;
  @Column({ name: "location_id", type: "bigint" }) locationId!: number;
  @ManyToOne(() => Location, (x) => x.inventoryLedgers, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "location_id" })
  location!: Location;
  @Column({ name: "product_id", type: "bigint" }) productId!: number;
  @ManyToOne(() => Product, (x) => x.inventoryLedgers, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "product_id" })
  product!: Product;
  @Column({ name: "movement_date", type: "datetime" }) movementDate!: Date;
  @Column({ name: "movement_type", type: "varchar", length: 30 })
  movementType!: string;
  @Column({ name: "source_document_type", type: "varchar", length: 30 })
  sourceDocumentType!: string;
  @Column({ name: "source_document_id", type: "bigint" })
  sourceDocumentId!: number;
  @Column({ name: "source_document_line_id", type: "bigint" })
  sourceDocumentLineId!: number;
  @Column({ name: "quantity_in", type: "decimal", precision: 18, scale: 4 })
  quantityIn!: string;
  @Column({
    name: "quantity_out",
    type: "decimal",
    precision: 18,
    scale: 4,
    default: 0,
  })
  quantityOut!: string;
  @Column({ name: "unit_cost", type: "decimal", precision: 18, scale: 4 })
  unitCost!: string;
  @Column({ name: "movement_value", type: "decimal", precision: 18, scale: 4 })
  movementValue!: string;
  @Column({ name: "quantity_before", type: "decimal", precision: 18, scale: 4 })
  quantityBefore!: string;
  @Column({ name: "quantity_after", type: "decimal", precision: 18, scale: 4 })
  quantityAfter!: string;
  @Column({
    name: "average_cost_before",
    type: "decimal",
    precision: 18,
    scale: 4,
  })
  averageCostBefore!: string;
  @Column({
    name: "average_cost_after",
    type: "decimal",
    precision: 18,
    scale: 4,
  })
  averageCostAfter!: string;
  @Column({ name: "created_by_user_id", type: "bigint" })
  createdByUserId!: number;
  @ManyToOne(() => User, (x) => x.inventoryLedgers, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "created_by_user_id" })
  createdByUser!: User;
}
