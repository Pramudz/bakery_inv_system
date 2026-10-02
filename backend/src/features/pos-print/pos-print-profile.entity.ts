import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('tbl_pos_print_profile')
@Index('uq_pos_print_profile_scope', ['tenantId', 'locationId', 'scopeKey'], { unique: true })
export class PosPrintProfile {
  @PrimaryGeneratedColumn({ name: 'pos_print_profile_id', type: 'bigint' }) posPrintProfileId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @Column({ name: 'location_id', type: 'bigint' }) locationId!: number;
  @Column({ name: 'pos_terminal_id', type: 'bigint', nullable: true }) posTerminalId!: number | null;
  @Column({ name: 'scope_key', type: 'varchar', length: 30 }) scopeKey!: string;
  @Column({ name: 'display_name', type: 'varchar', length: 100 }) displayName!: string;
  @Column({ type: 'varchar', length: 20 }) transport!: 'TCP' | 'WINDOWS_QUEUE';
  @Column({ type: 'varchar', length: 255 }) target!: string;
  @Column({ type: 'int', unsigned: true, nullable: true }) port!: number | null;
  @Column({ name: 'paper_width', type: 'int', unsigned: true }) paperWidth!: 58 | 80;
  @Column({ type: 'varchar', length: 30 }) encoding!: string;
  @Column({ name: 'cut_enabled', type: 'boolean' }) cutEnabled!: boolean;
  @Column({ name: 'agent_token_hash', type: 'char', length: 64 }) agentTokenHash!: string;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3 }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 3 }) updatedAt!: Date;
}
