import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { ModuleEntity } from '../modules/modules.entity';
import { RolePermission } from '../role-permissions/role-permissions.entity';
@Entity('tbl_permission')
export class Permission extends AuditEntity {
  @PrimaryGeneratedColumn({ name:'permission_id', type:'bigint' }) permissionId!: number;
  @Column({name:'module_id',type:'bigint'}) moduleId!: number;
  @ManyToOne(() => ModuleEntity, (module) => module.permissions, { nullable:false }) @JoinColumn({name:'module_id'}) module!: ModuleEntity;
  @Column({name:'code',type:'varchar',length:100,unique:true}) code!: string;
  @Column({name:'name',type:'varchar',length:150}) name!: string;
  @Column({name:'description',type:'varchar',length:255,nullable:true}) description!: string|null;
  @Column({name:'is_active',default:true}) isActive!: boolean;
  @OneToMany(() => RolePermission, (rolePermission) => rolePermission.permission) rolePermissions!: RolePermission[];
}
