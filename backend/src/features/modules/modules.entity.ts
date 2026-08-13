import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Permission } from '../permissions/permissions.entity';
@Entity('tbl_module')
export class ModuleEntity extends AuditEntity {
  @PrimaryGeneratedColumn({ name:'module_id', type:'bigint' }) moduleId!: number;
  @Column({name:'code',type:'varchar',length:50,unique:true}) code!: string;
  @Column({name:'name',type:'varchar',length:100}) name!: string;
  @Column({name:'description',type:'varchar',length:255,nullable:true}) description!: string|null;
  @Column({name:'display_order',type:'int',nullable:true}) displayOrder!: number|null;
  @Column({name:'is_active',default:true}) isActive!: boolean;
  @OneToMany(() => Permission, (permission) => permission.module) permissions!: Permission[];
}
