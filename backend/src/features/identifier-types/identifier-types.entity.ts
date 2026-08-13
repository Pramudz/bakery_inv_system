import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { ProductIdentifier } from '../product-identifiers/product-identifiers.entity';
@Entity('tbl_identifier_type')
export class IdentifierType extends AuditEntity {
  @PrimaryGeneratedColumn({name:'identifier_type_id',type:'bigint'}) identifierTypeId!: number;
  @Column({name:'code',type:'varchar',length:50,unique:true}) code!: string;
  @Column({name:'name',type:'varchar',length:100}) name!: string;
  @Column({name:'description',type:'varchar',length:255,nullable:true}) description!: string|null;
  @Column({name:'is_active',default:true}) isActive!: boolean;
  @OneToMany(() => ProductIdentifier, (identifier) => identifier.identifierType) productIdentifiers!: ProductIdentifier[];
}
