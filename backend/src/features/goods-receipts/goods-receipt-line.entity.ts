import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { AuditEntity } from "../../common/audit.entity";
import { Product } from "../products/products.entity";
import { UnitOfMeasure } from "../units/units.entity";
import { GoodsReceipt } from "./goods-receipt.entity";
import { PurchaseOrderLine } from "../purchase-orders/purchase-order-line.entity";
import { ProductUnit } from "../product-units/product-units.entity";
@Entity("tbl_goods_receipt_line")
export class GoodsReceiptLine extends AuditEntity {
  @PrimaryGeneratedColumn({ name: "goods_receipt_line_id", type: "bigint" })
  goodsReceiptLineId!: number;
  @Column({ name: "goods_receipt_id", type: "bigint" }) goodsReceiptId!: number;
  @ManyToOne(() => GoodsReceipt, (x) => x.lines, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "goods_receipt_id" })
  goodsReceipt!: GoodsReceipt;
  @Column({ name: "purchase_order_line_id", type: "bigint", nullable: true })
  purchaseOrderLineId!: number | null;
  @ManyToOne(() => PurchaseOrderLine, (x) => x.goodsReceiptLines, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "purchase_order_line_id" })
  purchaseOrderLine!: PurchaseOrderLine | null;
  @Column({ name: "product_id", type: "bigint" }) productId!: number;
  @ManyToOne(() => Product, (x) => x.goodsReceiptLines, {
    nullable: false,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "product_id" })
  product!: Product;
  @Column({ name: "unit_id", type: "bigint" }) unitId!: number;
  @ManyToOne(() => UnitOfMeasure, (x) => x.goodsReceiptLines, {
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
  @Column({ name: "received_qty", type: "decimal", precision: 18, scale: 4 })
  receivedQty!: string;
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
  @Column({ type: "text", nullable: true }) notes!: string | null;
}
