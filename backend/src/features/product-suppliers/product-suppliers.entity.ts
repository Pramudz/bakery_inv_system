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
import { Product } from "../products/products.entity";
import { Supplier } from "../suppliers/suppliers.entity";
import { ProductSupplierUnit } from '../product-supplier-units/product-supplier-unit.entity';

@Entity("tbl_product_supplier")
@Unique("uq_product_supplier_product_supplier", ["productId", "supplierId"])
export class ProductSupplier extends AuditEntity {
  @PrimaryGeneratedColumn({ name: "product_supplier_id", type: "bigint" })
  productSupplierId!: number;
  @Column({ name: "product_id", type: "bigint" }) productId!: number;
  @ManyToOne(() => Product, (product) => product.productSuppliers, {
    nullable: false,
  })
  @JoinColumn({ name: "product_id" })
  product!: Product;
  @Column({ name: "supplier_id", type: "bigint" }) supplierId!: number;
  @ManyToOne(() => Supplier, (supplier) => supplier.productSuppliers, {
    nullable: false,
  })
  @JoinColumn({ name: "supplier_id" })
  supplier!: Supplier;
  @Column({ name: "is_primary_supplier", default: false })
  isPrimarySupplier!: boolean;
  @Column({ name: "is_active", default: true }) isActive!: boolean;
  @OneToMany(
  () => ProductSupplierUnit,
    (supplierUnit) => supplierUnit.productSupplier,
  )
  supplierUnits!: ProductSupplierUnit[];
}
