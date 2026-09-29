import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';
import { PosTerminal } from './pos-terminal.entity';

@Entity('tbl_pos_terminal_activation')
@Index('uq_pos_terminal_activation_hash', ['activationSecretHash'], { unique: true })
@Index('ix_pos_terminal_activation_terminal', ['posTerminalId', 'expiresAt'])
export class PosTerminalActivation extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'pos_terminal_activation_id', type: 'bigint' }) posTerminalActivationId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @Column({ name: 'pos_terminal_id', type: 'bigint' }) posTerminalId!: number;
  @ManyToOne(() => PosTerminal, (terminal) => terminal.activations, { nullable: false, onDelete: 'CASCADE' }) @JoinColumn({ name: 'pos_terminal_id' }) terminal!: PosTerminal;
  @Column({ name: 'activation_secret_hash', type: 'char', length: 64 }) activationSecretHash!: string;
  @Column({ name: 'expires_at', type: 'datetime' }) expiresAt!: Date;
  @Column({ name: 'consumed_at', type: 'datetime', nullable: true }) consumedAt!: Date | null;
  @Column({ name: 'consumed_by_user_id', type: 'bigint', nullable: true }) consumedByUserId!: number | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'consumed_by_user_id' }) consumedByUser!: User | null;
  @Column({ name: 'issued_by_user_id', type: 'bigint' }) issuedByUserId!: number;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'issued_by_user_id' }) issuedByUser!: User;
  @Column({ name: 'revoked_at', type: 'datetime', nullable: true }) revokedAt!: Date | null;
  @Column({ name: 'revoked_by_user_id', type: 'bigint', nullable: true }) revokedByUserId!: number | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'revoked_by_user_id' }) revokedByUser!: User | null;
}
