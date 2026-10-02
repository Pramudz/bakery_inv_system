import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Location } from '../locations/locations.entity';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';
import { PosCashierSession } from './pos-cashier-session.entity';
import { PosRegisterSession } from './pos-register-session.entity';

export enum PosCashReconciliationStatus {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum PosCashReconciliationType {
  TERMINAL_CASH_COUNT = 'TERMINAL_CASH_COUNT',
  MASTER_CASH_BATCH = 'MASTER_CASH_BATCH',
}

@Entity('tbl_pos_cash_reconciliation')
@Index('uq_pos_reconciliation_attempt', ['posCashierSessionId', 'attemptNumber'], { unique: true })
@Index('uq_pos_reconciliation_submission', ['tenantId', 'submissionKey'], { unique: true })
@Index('uq_pos_reconciliation_verification', ['tenantId', 'verificationKey'], { unique: true })
@Index('uq_pos_reconciliation_pending', ['tenantId', 'pendingCashierGuard'], { unique: true })
@Index('ix_pos_reconciliation_queue', ['tenantId', 'status', 'submittedAt'])
export class PosCashReconciliation extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'pos_cash_reconciliation_id', type: 'bigint' }) posCashReconciliationId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @Column({ name: 'location_id', type: 'bigint' }) locationId!: number;
  @ManyToOne(() => Location, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'location_id' }) location!: Location;
  @Column({ name: 'pos_register_session_id', type: 'bigint' }) posRegisterSessionId!: number;
  @ManyToOne(() => PosRegisterSession, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pos_register_session_id' }) registerSession!: PosRegisterSession;
  @Column({ name: 'pos_cashier_session_id', type: 'bigint' }) posCashierSessionId!: number;
  @ManyToOne(() => PosCashierSession, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pos_cashier_session_id' }) cashierSession!: PosCashierSession;
  @Column({ name: 'attempt_number', type: 'int' }) attemptNumber!: number;
  @Column({ name: 'reconciliation_type', type: 'enum', enum: PosCashReconciliationType, default: PosCashReconciliationType.TERMINAL_CASH_COUNT }) reconciliationType!: PosCashReconciliationType;
  @Column({ name: 'submission_key', type: 'varchar', length: 36 }) submissionKey!: string;
  @Column({ name: 'submission_fingerprint', type: 'char', length: 64, nullable: true }) submissionFingerprint!: string | null;
  @Column({ name: 'opening_balance', type: 'decimal', precision: 18, scale: 2 }) openingBalance!: string;
  @Column({ name: 'cash_received', type: 'decimal', precision: 18, scale: 2 }) cashReceived!: string;
  @Column({ name: 'cash_paid_out', type: 'decimal', precision: 18, scale: 2 }) cashPaidOut!: string;
  @Column({ name: 'expected_cash', type: 'decimal', precision: 18, scale: 2 }) expectedCash!: string;
  @Column({ name: 'counted_cash', type: 'decimal', precision: 18, scale: 2, nullable: true }) countedCash!: string | null;
  @Column({ name: 'cashier_variance', type: 'decimal', precision: 18, scale: 2, nullable: true }) cashierVariance!: string | null;
  @Column({ name: 'summary_snapshot', type: 'json' }) summarySnapshot!: Record<string, unknown>;
  @Column({ name: 'submitted_by_user_id', type: 'bigint' }) submittedByUserId!: number;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'submitted_by_user_id' }) submittedByUser!: User;
  @Column({ name: 'submitted_at', type: 'datetime' }) submittedAt!: Date;
  @Column({ name: 'status', type: 'enum', enum: PosCashReconciliationStatus }) status!: PosCashReconciliationStatus;
  @Column({ name: 'verified_counted_cash', type: 'decimal', precision: 18, scale: 2, nullable: true }) verifiedCountedCash!: string | null;
  @Column({ name: 'verified_variance', type: 'decimal', precision: 18, scale: 2, nullable: true }) verifiedVariance!: string | null;
  @Column({ name: 'verified_by_user_id', type: 'bigint', nullable: true }) verifiedByUserId!: number | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'verified_by_user_id' }) verifiedByUser!: User | null;
  @Column({ name: 'verified_at', type: 'datetime', nullable: true }) verifiedAt!: Date | null;
  @Column({ name: 'verification_key', type: 'varchar', length: 36, nullable: true }) verificationKey!: string | null;
  @Column({ name: 'verification_fingerprint', type: 'char', length: 64, nullable: true }) verificationFingerprint!: string | null;
  @Column({ name: 'confirmed_net_cash', type: 'decimal', precision: 18, scale: 2, nullable: true }) confirmedNetCash!: string | null;
  @Column({ name: 'confirmation_variance', type: 'decimal', precision: 18, scale: 2, nullable: true }) confirmationVariance!: string | null;
  @Column({ name: 'physical_recipient_identity', type: 'varchar', length: 150, nullable: true }) physicalRecipientIdentity!: string | null;
  @Column({ name: 'verification_reason', type: 'varchar', length: 255, nullable: true }) verificationReason!: string | null;
  @Column({ name: 'rejection_reason', type: 'varchar', length: 255, nullable: true }) rejectionReason!: string | null;
  @Column({ name: 'pending_cashier_guard', type: 'bigint', nullable: true, insert: false, update: false, select: false }) pendingCashierGuard!: number | null;
}
