import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { AuditEntity } from "../../common/audit.entity";
import { Product } from "../products/products.entity";
import { UnitOfMeasure } from "../units/units.entity";
import { PurchaseOrder } from "./purchase-order.entity";
import { GoodsReceiptLine } from "../goods-receipts/goods-receipt-line.entity";
import { ProductUnit } from "../product-units/product-units.entity";
@Entity("tbl_purchase_order_line")
export class PurchaseOrderLine extends AuditEntity {
  @PrimaryGeneratedColumn({ name: "purchase_order_line_id", type: "bigint" })
  purchaseOrderLineId!: number;
  @Column({ name: "purchase_order_id", type: "bigint" })
  purchaseOrderId!: number;
  @ManyToOne(() => PurchaseOrder, (x) => x.lines, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "purchase_order_id" })
  purchaseOrder!: PurchaseOrder;
  @Column({ name: "product_id", type: "bigint" }) productId!: number;
  @ManyToOne(() => Product, (x) => x.purchaseOrderLines, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "product_id" })
  product!: Product;
  @Column({ name: "unit_id", type: "bigint" }) unitId!: number;
  @ManyToOne(() => UnitOfMeasure, (x) => x.purchaseOrderLines, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "unit_id" })
  unit!: UnitOfMeasure;
  @Column({ name: "product_unit_id", type: "bigint", nullable: true })
  productUnitId!: number | null;
  @ManyToOne(() => ProductUnit, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "product_unit_id" })
  productUnit!: ProductUnit | null;
  @Column({ name: "conversion_factor_snapshot", type: "decimal", precision: 18, scale: 6, nullable: true })
  conversionFactorSnapshot!: string | null;
  @Column({ name: "ordered_qty", type: "decimal", precision: 18, scale: 4 })
  orderedQty!: string;
  @Column({ name: "unit_cost", type: "decimal", precision: 18, scale: 4 })
  unitCost!: string;
  @Column({ name: "source_supplier_price_id", type: "bigint", nullable: true })
  sourceSupplierPriceId!: number | null;
  @Column({
    name: "discount_amount",
    type: "decimal",
    precision: 18,
    scale: 4,
    default: 0,
  })
  discountAmount!: string;
  @Column({
    name: "tax_amount",
    type: "decimal",
    precision: 18,
    scale: 4,
    default: 0,
  })
  taxAmount!: string;
  @Column({ name: "net_unit_cost", type: "decimal", precision: 18, scale: 4 })
  netUnitCost!: string;
  @Column({ name: "line_total", type: "decimal", precision: 18, scale: 4 })
  lineTotal!: string;
  @Column({
    name: "received_qty",
    type: "decimal",
    precision: 18,
    scale: 4,
    default: 0,
  })
  receivedQty!: string;
  @Column({ type: "varchar", length: 30, default: "OPEN" }) status!: string;
  @Column({ type: "text", nullable: true }) notes!: string | null;
  @OneToMany(() => GoodsReceiptLine, (x) => x.purchaseOrderLine)
  goodsReceiptLines!: GoodsReceiptLine[];
}
