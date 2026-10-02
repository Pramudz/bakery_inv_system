import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Location } from '../locations/locations.entity';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';
import { PosCashReconciliationStatus } from './pos-cash-reconciliation.entity';
import { PosRegisterSession } from './pos-register-session.entity';

@Entity('tbl_pos_master_reconciliation')
@Index('uq_pos_master_reconciliation_attempt', ['posRegisterSessionId', 'attemptNumber'], { unique: true })
@Index('uq_pos_master_reconciliation_submission', ['tenantId', 'submissionKey'], { unique: true })
@Index('uq_pos_master_reconciliation_verification', ['tenantId', 'verificationKey'], { unique: true })
@Index('uq_pos_master_reconciliation_pending', ['tenantId', 'pendingRegisterGuard'], { unique: true })
@Index('ix_pos_master_reconciliation_queue', ['tenantId', 'status', 'submittedAt'])
export class PosMasterReconciliation extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'pos_master_reconciliation_id', type: 'bigint' }) posMasterReconciliationId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @Column({ name: 'location_id', type: 'bigint' }) locationId!: number;
  @ManyToOne(() => Location, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'location_id' }) location!: Location;
  @Column({ name: 'pos_register_session_id', type: 'bigint' }) posRegisterSessionId!: number;
  @ManyToOne(() => PosRegisterSession, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pos_register_session_id' }) registerSession!: PosRegisterSession;
  @Column({ name: 'attempt_number', type: 'int' }) attemptNumber!: number;
  @Column({ name: 'submission_key', type: 'varchar', length: 36 }) submissionKey!: string;
  @Column({ name: 'submission_fingerprint', type: 'char', length: 64 }) submissionFingerprint!: string;
  @Column({ name: 'opening_balance', type: 'decimal', precision: 18, scale: 2 }) openingBalance!: string;
  @Column({ name: 'system_expected_cash', type: 'decimal', precision: 18, scale: 2 }) systemExpectedCash!: string;
  @Column({ name: 'confirmed_batch_cash_basis', type: 'decimal', precision: 18, scale: 2 }) confirmedBatchCashBasis!: string;
  @Column({ name: 'batch_confirmation_difference', type: 'decimal', precision: 18, scale: 2 }) batchConfirmationDifference!: string;
  @Column({ name: 'counted_cash', type: 'decimal', precision: 18, scale: 2 }) countedCash!: string;
  @Column({ name: 'count_vs_confirmed_basis', type: 'decimal', precision: 18, scale: 2 }) countVsConfirmedBasis!: string;
  @Column({ name: 'count_vs_system_expected', type: 'decimal', precision: 18, scale: 2 }) countVsSystemExpected!: string;
  @Column({ name: 'summary_snapshot', type: 'json' }) summarySnapshot!: Record<string, unknown>;
  @Column({ name: 'master_cashier_identity', type: 'varchar', length: 150 }) masterCashierIdentity!: string;
  @Column({ name: 'submitted_by_user_id', type: 'bigint' }) submittedByUserId!: number;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'submitted_by_user_id' }) submittedByUser!: User;
  @Column({ name: 'submitted_at', type: 'datetime' }) submittedAt!: Date;
  @Column({ name: 'status', type: 'enum', enum: PosCashReconciliationStatus }) status!: PosCashReconciliationStatus;
  @Column({ name: 'verified_counted_cash', type: 'decimal', precision: 18, scale: 2, nullable: true }) verifiedCountedCash!: string | null;
  @Column({ name: 'verified_vs_confirmed_basis', type: 'decimal', precision: 18, scale: 2, nullable: true }) verifiedVsConfirmedBasis!: string | null;
  @Column({ name: 'verified_vs_system_expected', type: 'decimal', precision: 18, scale: 2, nullable: true }) verifiedVsSystemExpected!: string | null;
  @Column({ name: 'verified_by_user_id', type: 'bigint', nullable: true }) verifiedByUserId!: number | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'verified_by_user_id' }) verifiedByUser!: User | null;
  @Column({ name: 'verified_at', type: 'datetime', nullable: true }) verifiedAt!: Date | null;
  @Column({ name: 'verification_key', type: 'varchar', length: 36, nullable: true }) verificationKey!: string | null;
  @Column({ name: 'verification_fingerprint', type: 'char', length: 64, nullable: true }) verificationFingerprint!: string | null;
  @Column({ name: 'rejection_reason', type: 'varchar', length: 255, nullable: true }) rejectionReason!: string | null;
  @Column({ name: 'pending_register_guard', type: 'bigint', nullable: true, insert: false, update: false, select: false }) pendingRegisterGuard!: number | null;
}
