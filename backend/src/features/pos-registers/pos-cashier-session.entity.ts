import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Location } from '../locations/locations.entity';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';
import { PosRegisterSession } from './pos-register-session.entity';
import { PosTerminal } from './pos-terminal.entity';

export enum PosCashierSessionStatus {
  ACTIVE = 'ACTIVE',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  RECOUNT_REQUIRED = 'RECOUNT_REQUIRED',
  ENDED = 'ENDED',
}

@Entity('tbl_pos_cashier_session')
@Index('uq_pos_cashier_session_active_cashier', ['tenantId', 'activeCashierGuard'], { unique: true })
@Index('uq_pos_cashier_session_active_terminal', ['tenantId', 'activeTerminalGuard'], { unique: true })
@Index('ix_pos_cashier_session_register', ['posRegisterSessionId', 'status'])
@Index('ix_pos_cashier_session_cashier_user', ['cashierUserId'])
@Index('ix_pos_cashier_session_terminal', ['posTerminalId'])
@Index('ix_pos_cashier_session_tenant', ['tenantId'])
export class PosCashierSession extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'pos_cashier_session_id', type: 'bigint' }) posCashierSessionId!: number;
  @Column({ name: 'pos_register_session_id', type: 'bigint' }) posRegisterSessionId!: number;
  @ManyToOne(() => PosRegisterSession, (session) => session.cashierSessions, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pos_register_session_id' }) registerSession!: PosRegisterSession;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @Column({ name: 'location_id', type: 'bigint' }) locationId!: number;
  @ManyToOne(() => Location, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'location_id' }) location!: Location;
  @Column({ name: 'cashier_user_id', type: 'bigint' }) cashierUserId!: number;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'cashier_user_id' }) cashier!: User;
  @Column({ name: 'pos_terminal_id', type: 'bigint' }) posTerminalId!: number;
  @ManyToOne(() => PosTerminal, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pos_terminal_id' }) terminal!: PosTerminal;
  @Column({ name: 'started_at', type: 'datetime' }) startedAt!: Date;
  @Column({ name: 'ended_at', type: 'datetime', nullable: true }) endedAt!: Date | null;
  @Column({ name: 'ended_by_user_id', type: 'bigint', nullable: true }) endedByUserId!: number | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'ended_by_user_id' }) endedByUser!: User | null;
  @Column({ name: 'status', type: 'enum', enum: PosCashierSessionStatus }) status!: PosCashierSessionStatus;
  @Column({ name: 'active_cashier_guard', type: 'bigint', nullable: true, insert: false, update: false, select: false }) activeCashierGuard!: number | null;
  @Column({ name: 'active_terminal_guard', type: 'bigint', nullable: true, insert: false, update: false, select: false }) activeTerminalGuard!: number | null;
}
