import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { AuditEntity } from "../../common/audit.entity";
import { ProductSupplierUnit } from '../product-supplier-units/product-supplier-unit.entity';
@Entity("tbl_product_supplier_price")
@Index("idx_supplier_price_supplier_unit_effective_context", [
  "productSupplierUnitId",
  "currencyCode",
  "minimumQuantity",
  "effectiveFrom",
])
export class ProductSupplierPrice extends AuditEntity {
  @PrimaryGeneratedColumn({ name: "product_supplier_price_id", type: "bigint" })
  productSupplierPriceId!: number;
  @Column({
    name: 'product_supplier_unit_id',
    type: 'bigint',
    nullable: false,
  })
  productSupplierUnitId!: number;

   @ManyToOne(
    () => ProductSupplierUnit,
    (supplierUnit) => supplierUnit.prices,
    { nullable: false },
  )
  @JoinColumn({ name: 'product_supplier_unit_id' })
   productSupplierUnit!: ProductSupplierUnit;
  @Column({ name: "purchase_price", type: "decimal", precision: 18, scale: 4 })
  purchasePrice!: string;
  @Column({ name: "currency_code", type: "varchar", length: 3, default: "LKR" })
  currencyCode!: string;
  @Column({
    name: "minimum_quantity",
    type: "decimal",
    precision: 18,
    scale: 6,
    default: 1,
  })
  minimumQuantity!: string;
  @Column({ name: "effective_from", type: "datetime" }) effectiveFrom!: Date;
  @Column({ name: "effective_to", type: "datetime", nullable: true })
  effectiveTo!: Date | null;
  @Column({ name: "is_active", default: true }) isActive!: boolean;
}
