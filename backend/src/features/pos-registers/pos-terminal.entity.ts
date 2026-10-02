import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Location } from '../locations/locations.entity';
import { Tenant } from '../tenants/tenant.entity';
import { PosTerminalActivation } from './pos-terminal-activation.entity';
import { PosTerminalPairing } from './pos-terminal-pairing.entity';

@Entity('tbl_pos_terminal')
@Index('uq_pos_terminal_location_code', ['tenantId', 'locationId', 'terminalCode'], { unique: true })
@Index('ix_pos_terminal_tenant_location', ['tenantId', 'locationId'])
export class PosTerminal extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'pos_terminal_id', type: 'bigint' }) posTerminalId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @Column({ name: 'location_id', type: 'bigint' }) locationId!: number;
  @ManyToOne(() => Location, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'location_id' }) location!: Location;
  @Column({ name: 'terminal_code', type: 'varchar', length: 50 }) terminalCode!: string;
  @Column({ name: 'display_name', type: 'varchar', length: 150 }) displayName!: string;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
  @OneToMany(() => PosTerminalActivation, (activation) => activation.terminal) activations!: PosTerminalActivation[];
  @OneToMany(() => PosTerminalPairing, (pairing) => pairing.terminal) pairings!: PosTerminalPairing[];
}
