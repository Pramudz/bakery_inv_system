import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { User } from '../users/user.entity';
import { Role } from '../roles/roles.entity';
@Entity('tbl_user_role')
export class UserRole extends AuditEntity {
  @PrimaryGeneratedColumn({ name:'user_role_id', type:'bigint' }) userRoleId!: number;
  @Column({name:'user_id',type:'bigint'}) userId!: number;
  @ManyToOne(() => User, (user) => user.userRoles, { nullable:false }) @JoinColumn({name:'user_id'}) user!: User;
  @Column({name:'role_id',type:'bigint'}) roleId!: number;
  @ManyToOne(() => Role, (role) => role.userRoles, { nullable:false }) @JoinColumn({name:'role_id'}) role!: Role;
  @Column({name:'assigned_at',type:'datetime'}) assignedAt!: Date;
}
