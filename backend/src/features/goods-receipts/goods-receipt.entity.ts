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
import { PurchaseOrder } from "../purchase-orders/purchase-order.entity";
import { GoodsReceiptLine } from "./goods-receipt-line.entity";
@Entity("tbl_goods_receipt")
@Unique(["tenantId", "grnNumber"])
export class GoodsReceipt extends AuditEntity {
  @PrimaryGeneratedColumn({ name: "goods_receipt_id", type: "bigint" })
  goodsReceiptId!: number;
  @Column({ name: "tenant_id", type: "bigint" }) tenantId!: number;
  @ManyToOne(() => Tenant, (x) => x.goodsReceipts, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;
  @Column({ name: "grn_number", type: "varchar", length: 50, nullable: true })
  grnNumber!: string | null;
  @Column({ name: "receipt_type", type: "varchar", length: 20 })
  receiptType!: string;
  @Column({ name: "purchase_order_id", type: "bigint", nullable: true })
  purchaseOrderId!: number | null;
  @ManyToOne(() => PurchaseOrder, (x) => x.goodsReceipts, {
    nullable: true,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "purchase_order_id" })
  purchaseOrder!: PurchaseOrder | null;
  @Column({ name: "supplier_id", type: "bigint" }) supplierId!: number;
  @ManyToOne(() => Supplier, (x) => x.goodsReceipts, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "supplier_id" })
  supplier!: Supplier;
  @Column({ name: "location_id", type: "bigint" }) locationId!: number;
  @ManyToOne(() => Location, (x) => x.goodsReceipts, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "location_id" })
  location!: Location;
  @Column({
    name: "supplier_invoice_number",
    type: "varchar",
    length: 100,
    nullable: true,
  })
  supplierInvoiceNumber!: string | null;
  @Column({ name: "supplier_invoice_date", type: "date", nullable: true })
  supplierInvoiceDate!: string | null;
  @Column({
    name: "supplier_delivery_note_number",
    type: "varchar",
    length: 100,
    nullable: true,
  })
  supplierDeliveryNoteNumber!: string | null;
  @Column({ name: "receipt_date", type: "date" }) receiptDate!: string;
  @Column({ name: "currency_code", type: "varchar", length: 3, default: "LKR" })
  currencyCode!: string;
  @Column({ type: "varchar", length: 20, default: "DRAFT" }) status!: string;
  @Column({ type: "text", nullable: true }) notes!: string | null;
  @Column({ name: "created_by_user_id", type: "bigint" })
  createdByUserId!: number;
  @ManyToOne(() => User, (x) => x.createdGoodsReceipts, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "created_by_user_id" })
  createdByUser!: User;
  @Column({ name: "posted_by_user_id", type: "bigint", nullable: true })
  postedByUserId!: number | null;
  @ManyToOne(() => User, (x) => x.postedGoodsReceipts, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "posted_by_user_id" })
  postedByUser!: User | null;
  @Column({ name: "posted_at", type: "datetime", nullable: true })
  postedAt!: Date | null;
  @Column({ name: "cancelled_by_user_id", type: "bigint", nullable: true })
  cancelledByUserId!: number | null;
  @ManyToOne(() => User, (x) => x.cancelledGoodsReceipts, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "cancelled_by_user_id" })
  cancelledByUser!: User | null;
  @Column({ name: "cancelled_at", type: "datetime", nullable: true })
  cancelledAt!: Date | null;
  @Column({ name: "is_active", default: true }) isActive!: boolean;
  @OneToMany(() => GoodsReceiptLine, (x) => x.goodsReceipt)
  lines!: GoodsReceiptLine[];
}
