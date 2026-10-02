import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Location } from '../locations/locations.entity';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';
import { PosCashRegister } from './pos-cash-register.entity';
import { PosCashierSession } from './pos-cashier-session.entity';

export enum PosRegisterSessionStatus {
  OPEN = 'OPEN',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  RECOUNT_REQUIRED = 'RECOUNT_REQUIRED',
  CLOSED = 'CLOSED',
}

@Entity('tbl_pos_register_session')
@Index('uq_pos_register_session_open_guard', ['tenantId', 'openRegisterGuard'], { unique: true })
@Index('ix_pos_register_session_location_date', ['tenantId', 'locationId', 'businessDate'])
export class PosRegisterSession extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'pos_register_session_id', type: 'bigint' }) posRegisterSessionId!: number;
  @Column({ name: 'pos_cash_register_id', type: 'bigint' }) posCashRegisterId!: number;
  @ManyToOne(() => PosCashRegister, (register) => register.sessions, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pos_cash_register_id' }) register!: PosCashRegister;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @Column({ name: 'location_id', type: 'bigint' }) locationId!: number;
  @ManyToOne(() => Location, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'location_id' }) location!: Location;
  @Column({ name: 'business_date', type: 'date' }) businessDate!: string;
  @Column({ name: 'opening_balance', type: 'decimal', precision: 18, scale: 2 }) openingBalance!: string;
  @Column({ name: 'opened_by_user_id', type: 'bigint' }) openedByUserId!: number;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'opened_by_user_id' }) openedByUser!: User;
  @Column({ name: 'opened_at', type: 'datetime' }) openedAt!: Date;
  @Column({ name: 'status', type: 'enum', enum: PosRegisterSessionStatus }) status!: PosRegisterSessionStatus;
  @Column({ name: 'closed_at', type: 'datetime', nullable: true }) closedAt!: Date | null;
  @Column({ name: 'closed_by_user_id', type: 'bigint', nullable: true }) closedByUserId!: number | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'closed_by_user_id' }) closedByUser!: User | null;
  @Column({ name: 'open_register_guard', type: 'bigint', nullable: true, insert: false, update: false, select: false }) openRegisterGuard!: number | null;
  @OneToMany(() => PosCashierSession, (session) => session.registerSession) cashierSessions!: PosCashierSession[];
}
