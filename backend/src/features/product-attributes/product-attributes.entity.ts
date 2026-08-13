import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Product } from '../products/products.entity';
import { Attribute } from '../attributes/attributes.entity';
@Entity('tbl_product_attributes')
export class ProductAttributes extends AuditEntity {
  @PrimaryGeneratedColumn({name:'product_attribute_id',type:'bigint'}) productAttributeId!: number;
  @Column({name:'product_id',type:'bigint'}) productId!: number;
  @ManyToOne(() => Product, (product) => product.productAttributes, {nullable:false}) @JoinColumn({name:'product_id'}) product!: Product;
  @Column({name:'attribute_id',type:'bigint'}) attributeId!: number;
  @ManyToOne(() => Attribute, (attribute) => attribute.productAttributes, {nullable:false}) @JoinColumn({name:'attribute_id'}) attribute!: Attribute;
  @Column({name:'value',type:'varchar',length:500}) value!: string;
}
