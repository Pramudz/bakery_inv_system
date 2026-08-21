import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Product } from '../products/products.entity';
import { Tenant } from '../tenants/tenant.entity';

@Entity('tbl_product_image')
@Index('idx_product_image_tenant_product', ['tenantId', 'productId', 'isActive'])
export class ProductImage extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'product_image_id', type: 'bigint' })
  productImageId!: number;

  @Column({ name: 'tenant_id', type: 'bigint' })
  tenantId!: number;

  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ name: 'product_id', type: 'bigint' })
  productId!: number;

  @ManyToOne(() => Product, (product) => product.productImages, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ name: 'image_url', type: 'varchar', length: 2048 })
  imageUrl!: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255, nullable: true })
  fileName!: string | null;

  @Column({ name: 'alt_text', type: 'varchar', length: 255, nullable: true })
  altText!: string | null;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder!: number;

  @Column({ name: 'is_primary', default: false })
  isPrimary!: boolean;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}
