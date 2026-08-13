import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { User } from '../users/user.entity';
import { Role } from '../roles/roles.entity';
import { Category } from '../categories/categories.entity';
import { Brand } from '../brands/brands.entity';
import { UnitOfMeasure } from '../units/units.entity';
import { Product } from '../products/products.entity';
import { Supplier } from '../suppliers/suppliers.entity';
import { PriceList } from '../price-lists/price-lists.entity';
import { Location } from '../locations/locations.entity';
import { Attribute } from '../attributes/attributes.entity';

@Entity('tbl_tenant')
export class Tenant extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @Column({ name: 'tenant_code', type: 'varchar', length: 50, unique: true }) tenantCode!: string;
  @Column({ name: 'tenant_name', type: 'varchar', length: 150 }) tenantName!: string;
  @Column({ name: 'tenant_is_active', default: true }) tenantIsActive!: boolean;

  @OneToMany(() => User, (user) => user.tenant) users!: User[];
  @OneToMany(() => Role, (role) => role.tenant) roles!: Role[];
  @OneToMany(() => Category, (category) => category.tenant) categories!: Category[];
  @OneToMany(() => Brand, (brand) => brand.tenant) brands!: Brand[];
  @OneToMany(() => UnitOfMeasure, (unit) => unit.tenant) units!: UnitOfMeasure[];
  @OneToMany(() => Product, (product) => product.tenant) products!: Product[];
  @OneToMany(() => Supplier, (supplier) => supplier.tenant) suppliers!: Supplier[];
  @OneToMany(() => PriceList, (priceList) => priceList.tenant) priceLists!: PriceList[];
  @OneToMany(() => Location, (location) => location.tenant) locations!: Location[];
  @OneToMany(() => Attribute, (attribute) => attribute.tenant) attributes!: Attribute[];
}
