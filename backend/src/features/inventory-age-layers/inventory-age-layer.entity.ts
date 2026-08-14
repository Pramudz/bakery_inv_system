import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { AuditEntity } from "../../common/audit.entity";
import { Tenant } from "../tenants/tenant.entity";
import { Location } from "../locations/locations.entity";
import { Product } from "../products/products.entity";
@Entity("tbl_inventory_age_layer")
export class InventoryAgeLayer extends AuditEntity {
  @PrimaryGeneratedColumn({ name: "inventory_age_layer_id", type: "bigint" })
  inventoryAgeLayerId!: number;
  @Column({ name: "tenant_id", type: "bigint" }) tenantId!: number;
  @ManyToOne(() => Tenant, (x) => x.inventoryAgeLayers, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;
  @Column({ name: "location_id", type: "bigint" }) locationId!: number;
  @ManyToOne(() => Location, (x) => x.inventoryAgeLayers, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "location_id" })
  location!: Location;
  @Column({ name: "product_id", type: "bigint" }) productId!: number;
  @ManyToOne(() => Product, (x) => x.inventoryAgeLayers, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "product_id" })
  product!: Product;
  @Column({ name: "source_document_type", type: "varchar", length: 30 })
  sourceDocumentType!: string;
  @Column({ name: "source_document_id", type: "bigint" })
  sourceDocumentId!: number;
  @Column({ name: "source_document_line_id", type: "bigint" })
  sourceDocumentLineId!: number;
  @Column({ name: "receipt_date", type: "date" }) receiptDate!: string;
  @Column({
    name: "original_quantity",
    type: "decimal",
    precision: 18,
    scale: 4,
  })
  originalQuantity!: string;
  @Column({
    name: "remaining_quantity",
    type: "decimal",
    precision: 18,
    scale: 4,
  })
  remainingQuantity!: string;
  @Column({
    name: "original_unit_cost",
    type: "decimal",
    precision: 18,
    scale: 4,
  })
  originalUnitCost!: string;
  @Column({
    name: "batch_number",
    type: "varchar",
    length: 100,
    nullable: true,
  })
  batchNumber!: string | null;
  @Column({ name: "manufacture_date", type: "date", nullable: true })
  manufactureDate!: string | null;
  @Column({ name: "expiry_date", type: "date", nullable: true }) expiryDate!:
    string | null;
  @Column({ name: "is_active", default: true }) isActive!: boolean;
}
