import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Role } from '../roles/roles.entity';
import { Permission } from '../permissions/permissions.entity';
@Entity('tbl_role_permission')
export class RolePermission extends AuditEntity {
  @PrimaryGeneratedColumn({ name:'role_permission_id', type:'bigint' }) rolePermissionId!: number;
  @Column({name:'role_id',type:'bigint'}) roleId!: number;
  @ManyToOne(() => Role, (role) => role.rolePermissions, { nullable:false }) @JoinColumn({name:'role_id'}) role!: Role;
  @Column({name:'permission_id',type:'bigint'}) permissionId!: number;
  @ManyToOne(() => Permission, (permission) => permission.rolePermissions, { nullable:false }) @JoinColumn({name:'permission_id'}) permission!: Permission;
  @Column({name:'assigned_at',type:'datetime'}) assignedAt!: Date;
}
