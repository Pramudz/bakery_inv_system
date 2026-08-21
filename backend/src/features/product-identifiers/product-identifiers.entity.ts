import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Product } from '../products/products.entity';
import { IdentifierType } from '../identifier-types/identifier-types.entity';
import { Tenant } from '../tenants/tenant.entity';
import { ProductUnit } from '../product-units/product-units.entity';
@Entity('tbl_product_identifier')
@Unique('uq_product_identifier_tenant_normalized', ['tenantId', 'normalizedIdentifierValue'])
export class ProductIdentifier extends AuditEntity {
  @PrimaryGeneratedColumn({name:'product_identifier_id',type:'bigint'}) productIdentifierId!: number;
  @Column({name:'tenant_id',type:'bigint'}) tenantId!: number;
  @ManyToOne(() => Tenant, {nullable:false}) @JoinColumn({name:'tenant_id'}) tenant!: Tenant;
  @Column({name:'product_id',type:'bigint'}) productId!: number;
  @ManyToOne(() => Product, (product) => product.identifiers, {nullable:false}) @JoinColumn({name:'product_id'}) product!: Product;
  @Column({name:'identifier_type_id',type:'bigint'}) identifierTypeId!: number;
  @ManyToOne(() => IdentifierType, (identifierType) => identifierType.productIdentifiers, {nullable:false}) @JoinColumn({name:'identifier_type_id'}) identifierType!: IdentifierType;
  @Column({name:'product_unit_id',type:'bigint',nullable:true}) productUnitId!: number|null;
  @ManyToOne(() => ProductUnit, {nullable:true,onDelete:'RESTRICT'}) @JoinColumn({name:'product_unit_id'}) productUnit!: ProductUnit|null;
  @Column({name:'identifier_value',type:'varchar',length:100}) identifierValue!: string;
  @Column({name:'normalized_identifier_value',type:'varchar',length:100}) normalizedIdentifierValue!: string;
  @Column({name:'is_primary',default:false}) isPrimary!: boolean;
  @Column({name:'is_active',default:true}) isActive!: boolean;
  @Column({name:'valid_from',type:'datetime',nullable:true}) validFrom!: Date|null;
  @Column({name:'valid_to',type:'datetime',nullable:true}) validTo!: Date|null;
}
