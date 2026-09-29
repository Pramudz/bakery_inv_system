import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Location } from '../locations/locations.entity';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';
import { PosCashierSession } from './pos-cashier-session.entity';
import { PosRegisterSession } from './pos-register-session.entity';

export enum PosCashMovementType {
  REFUND_PAYOUT = 'REFUND_PAYOUT',
  PAYMENT_REVERSAL_PAYOUT = 'PAYMENT_REVERSAL_PAYOUT',
}

export enum PosCashMovementDirection { IN = 'IN', OUT = 'OUT' }

@Entity('tbl_pos_cash_movement')
@Index('uq_pos_cash_movement_source', ['tenantId', 'sourceType', 'sourceId'], { unique: true })
@Index('ix_pos_cash_movement_register', ['posRegisterSessionId', 'occurredAt'])
export class PosCashMovement extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'pos_cash_movement_id', type: 'bigint' }) posCashMovementId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @Column({ name: 'location_id', type: 'bigint' }) locationId!: number;
  @ManyToOne(() => Location, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'location_id' }) location!: Location;
  @Column({ name: 'pos_register_session_id', type: 'bigint' }) posRegisterSessionId!: number;
  @ManyToOne(() => PosRegisterSession, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pos_register_session_id' }) registerSession!: PosRegisterSession;
  @Column({ name: 'pos_cashier_session_id', type: 'bigint' }) posCashierSessionId!: number;
  @ManyToOne(() => PosCashierSession, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pos_cashier_session_id' }) cashierSession!: PosCashierSession;
  @Column({ name: 'movement_type', type: 'enum', enum: PosCashMovementType }) movementType!: PosCashMovementType;
  @Column({ name: 'direction', type: 'enum', enum: PosCashMovementDirection }) direction!: PosCashMovementDirection;
  @Column({ name: 'amount', type: 'decimal', precision: 18, scale: 2 }) amount!: string;
  @Column({ name: 'source_type', type: 'varchar', length: 40 }) sourceType!: string;
  @Column({ name: 'source_id', type: 'bigint' }) sourceId!: number;
  @Column({ name: 'reason', type: 'varchar', length: 255 }) reason!: string;
  @Column({ name: 'occurred_at', type: 'datetime' }) occurredAt!: Date;
  @Column({ name: 'created_by_user_id', type: 'bigint' }) createdByUserId!: number;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'created_by_user_id' }) createdByUser!: User;
}
