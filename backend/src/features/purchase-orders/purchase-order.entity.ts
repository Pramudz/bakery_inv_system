import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { AuditEntity } from "../../common/audit.entity";
import { Tenant } from "../tenants/tenant.entity";
import { User } from "../users/user.entity";
import { Supplier } from "../suppliers/suppliers.entity";
import { Location } from "../locations/locations.entity";
import { PurchaseOrderLine } from "./purchase-order-line.entity";
import { GoodsReceipt } from "../goods-receipts/goods-receipt.entity";
@Entity("tbl_purchase_order")
@Unique(["tenantId", "poNumber"])
export class PurchaseOrder extends AuditEntity {
  @PrimaryGeneratedColumn({ name: "purchase_order_id", type: "bigint" })
  purchaseOrderId!: number;
  @Column({ name: "tenant_id", type: "bigint" }) tenantId!: number;
  @ManyToOne(() => Tenant, (x) => x.purchaseOrders, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;
  @Column({ name: "po_number", type: "varchar", length: 50 }) poNumber!: string;
  @Column({ name: "supplier_id", type: "bigint" }) supplierId!: number;
  @ManyToOne(() => Supplier, (x) => x.purchaseOrders, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "supplier_id" })
  supplier!: Supplier;
  @Column({ name: "location_id", type: "bigint" }) locationId!: number;
  @ManyToOne(() => Location, (x) => x.purchaseOrders, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "location_id" })
  location!: Location;
  @Column({ name: "order_date", type: "date" }) orderDate!: string;
  @Column({ name: "expected_date", type: "date", nullable: true })
  expectedDate!: string | null;
  @Column({ type: "varchar", length: 30, default: "DRAFT" }) status!: string;
  @Column({ name: "currency_code", type: "varchar", length: 3, default: "LKR" })
  currencyCode!: string;
  @Column({ type: "text", nullable: true }) notes!: string | null;
  @Column({ name: "created_by_user_id", type: "bigint" })
  createdByUserId!: number;
  @ManyToOne(() => User, (x) => x.createdPurchaseOrders, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "created_by_user_id" })
  createdByUser!: User;
  @Column({ name: "approved_by_user_id", type: "bigint", nullable: true })
  approvedByUserId!: number | null;
  @ManyToOne(() => User, (x) => x.approvedPurchaseOrders, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "approved_by_user_id" })
  approvedByUser!: User | null;
  @Column({ name: "approved_at", type: "datetime", nullable: true })
  approvedAt!: Date | null;
  @Column({ name: "cancelled_by_user_id", type: "bigint", nullable: true })
  cancelledByUserId!: number | null;
  @ManyToOne(() => User, (x) => x.cancelledPurchaseOrders, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "cancelled_by_user_id" })
  cancelledByUser!: User | null;
  @Column({ name: "cancelled_at", type: "datetime", nullable: true })
  cancelledAt!: Date | null;
  @Column({ name: "is_active", default: true }) isActive!: boolean;
  @OneToMany(() => PurchaseOrderLine, (x) => x.purchaseOrder)
  lines!: PurchaseOrderLine[];
  @OneToMany(() => GoodsReceipt, (x) => x.purchaseOrder)
  goodsReceipts!: GoodsReceipt[];
}
