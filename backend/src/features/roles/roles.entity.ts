import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Tenant } from '../tenants/tenant.entity';
import { UserRole } from '../user-roles/user-roles.entity';
import { RolePermission } from '../role-permissions/role-permissions.entity';
@Entity('tbl_role')
export class Role extends AuditEntity {
  @PrimaryGeneratedColumn({ name:'role_id', type:'bigint' }) roleId!: number;
  @Column({name:'tenant_id',type:'bigint'}) tenantId!: number;
  @ManyToOne(() => Tenant, (tenant) => tenant.roles, { nullable:false }) @JoinColumn({name:'tenant_id'}) tenant!: Tenant;
  @Column({name:'code',type:'varchar',length:50}) code!: string;
  @Column({name:'name',type:'varchar',length:100}) name!: string;
  @Column({name:'description',type:'varchar',length:255,nullable:true}) description!: string|null;
  @Column({name:'is_system_role',default:false}) isSystemRole!: boolean;
  @Column({name:'is_active',default:true}) isActive!: boolean;
  @OneToMany(() => UserRole, (userRole) => userRole.role) userRoles!: UserRole[];
  @OneToMany(() => RolePermission, (rolePermission) => rolePermission.role) rolePermissions!: RolePermission[];
}
