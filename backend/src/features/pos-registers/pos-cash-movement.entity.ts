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
export enum PosCashFundingSource { CASHIER_SESSION = 'CASHIER_SESSION', MASTER_REGISTER = 'MASTER_REGISTER' }

@Entity('tbl_pos_cash_movement')
@Index('uq_pos_cash_movement_source', ['tenantId', 'sourceType', 'sourceId'], { unique: true })
@Index('uq_pos_cash_movement_payout_key', ['tenantId', 'payoutKey'], { unique: true })
@Index('ix_pos_cash_movement_register', ['posRegisterSessionId', 'occurredAt'])
export class PosCashMovement extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'pos_cash_movement_id', type: 'bigint' }) posCashMovementId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @Column({ name: 'location_id', type: 'bigint' }) locationId!: number;
  @ManyToOne(() => Location, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'location_id' }) location!: Location;
  @Column({ name: 'pos_register_session_id', type: 'bigint' }) posRegisterSessionId!: number;
  @ManyToOne(() => PosRegisterSession, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pos_register_session_id' }) registerSession!: PosRegisterSession;
  @Column({ name: 'pos_cashier_session_id', type: 'bigint', nullable: true }) posCashierSessionId!: number | null;
  @ManyToOne(() => PosCashierSession, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pos_cashier_session_id' }) cashierSession!: PosCashierSession | null;
  @Column({ name: 'funding_source', type: 'enum', enum: PosCashFundingSource, default: PosCashFundingSource.CASHIER_SESSION }) fundingSource!: PosCashFundingSource;
  @Column({ name: 'movement_type', type: 'enum', enum: PosCashMovementType }) movementType!: PosCashMovementType;
  @Column({ name: 'direction', type: 'enum', enum: PosCashMovementDirection }) direction!: PosCashMovementDirection;
  @Column({ name: 'amount', type: 'decimal', precision: 18, scale: 2 }) amount!: string;
  @Column({ name: 'source_type', type: 'varchar', length: 40 }) sourceType!: string;
  @Column({ name: 'source_id', type: 'bigint' }) sourceId!: number;
  @Column({ name: 'reason', type: 'varchar', length: 255 }) reason!: string;
  @Column({ name: 'physical_payer_identity', type: 'varchar', length: 150, nullable: true }) physicalPayerIdentity!: string | null;
  @Column({ name: 'payout_key', type: 'varchar', length: 36, nullable: true }) payoutKey!: string | null;
  @Column({ name: 'payout_fingerprint', type: 'char', length: 64, nullable: true }) payoutFingerprint!: string | null;
  @Column({ name: 'occurred_at', type: 'datetime' }) occurredAt!: Date;
  @Column({ name: 'created_by_user_id', type: 'bigint' }) createdByUserId!: number;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'created_by_user_id' }) createdByUser!: User;
}
