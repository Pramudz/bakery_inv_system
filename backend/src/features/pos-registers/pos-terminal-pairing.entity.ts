import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';
import { PosTerminal } from './pos-terminal.entity';

@Entity('tbl_pos_terminal_pairing')
@Index('uq_pos_terminal_pairing_hash', ['pairingSecretHash'], { unique: true })
@Index('ix_pos_terminal_pairing_terminal', ['posTerminalId', 'revokedAt'])
export class PosTerminalPairing extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'pos_terminal_pairing_id', type: 'bigint' }) posTerminalPairingId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @Column({ name: 'pos_terminal_id', type: 'bigint' }) posTerminalId!: number;
  @ManyToOne(() => PosTerminal, (terminal) => terminal.pairings, { nullable: false, onDelete: 'CASCADE' }) @JoinColumn({ name: 'pos_terminal_id' }) terminal!: PosTerminal;
  @Column({ name: 'pairing_secret_hash', type: 'char', length: 64 }) pairingSecretHash!: string;
  @Column({ name: 'paired_at', type: 'datetime' }) pairedAt!: Date;
  @Column({ name: 'paired_by_user_id', type: 'bigint' }) pairedByUserId!: number;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'paired_by_user_id' }) pairedByUser!: User;
  @Column({ name: 'last_seen_at', type: 'datetime', nullable: true }) lastSeenAt!: Date | null;
  @Column({ name: 'revoked_at', type: 'datetime', nullable: true }) revokedAt!: Date | null;
  @Column({ name: 'revoked_by_user_id', type: 'bigint', nullable: true }) revokedByUserId!: number | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'revoked_by_user_id' }) revokedByUser!: User | null;
  @Column({ name: 'revocation_reason', type: 'varchar', length: 255, nullable: true }) revocationReason!: string | null;
}
