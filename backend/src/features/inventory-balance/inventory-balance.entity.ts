import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { AuditEntity } from "../../common/audit.entity";
import { Tenant } from "../tenants/tenant.entity";
import { Location } from "../locations/locations.entity";
import { Product } from "../products/products.entity";
@Entity("tbl_inventory_balance")
@Unique(["tenantId", "locationId", "productId"])
export class InventoryBalance extends AuditEntity {
  @PrimaryGeneratedColumn({ name: "inventory_balance_id", type: "bigint" })
  inventoryBalanceId!: number;
  @Column({ name: "tenant_id", type: "bigint" }) tenantId!: number;
  @ManyToOne(() => Tenant, (x) => x.inventoryBalances, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;
  @Column({ name: "location_id", type: "bigint" }) locationId!: number;
  @ManyToOne(() => Location, (x) => x.inventoryBalances, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "location_id" })
  location!: Location;
  @Column({ name: "product_id", type: "bigint" }) productId!: number;
  @ManyToOne(() => Product, (x) => x.inventoryBalances, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "product_id" })
  product!: Product;
  @Column({
    name: "quantity_on_hand",
    type: "decimal",
    precision: 18,
    scale: 4,
    default: 0,
  })
  quantityOnHand!: string;
  @Column({
    name: "average_cost",
    type: "decimal",
    precision: 18,
    scale: 4,
    default: 0,
  })
  averageCost!: string;
  @Column({ name: "last_movement_at", type: "datetime", nullable: true })
  lastMovementAt!: Date | null;
}
