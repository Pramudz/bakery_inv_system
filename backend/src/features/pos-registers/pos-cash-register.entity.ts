import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Location } from '../locations/locations.entity';
import { Tenant } from '../tenants/tenant.entity';
import { PosRegisterMode } from './pos-location-config.entity';
import { PosRegisterSession } from './pos-register-session.entity';
import { PosTerminal } from './pos-terminal.entity';

@Entity('tbl_pos_cash_register')
@Index('uq_pos_cash_register_tenant_key', ['tenantId', 'registerKey'], { unique: true })
@Index('uq_pos_cash_register_terminal', ['posTerminalId'], { unique: true })
@Index('ix_pos_cash_register_location', ['tenantId', 'locationId'])
export class PosCashRegister extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'pos_cash_register_id', type: 'bigint' }) posCashRegisterId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @Column({ name: 'location_id', type: 'bigint' }) locationId!: number;
  @ManyToOne(() => Location, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'location_id' }) location!: Location;
  @Column({ name: 'pos_terminal_id', type: 'bigint', nullable: true }) posTerminalId!: number | null;
  @ManyToOne(() => PosTerminal, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'pos_terminal_id' }) terminal!: PosTerminal | null;
  @Column({ name: 'register_mode', type: 'enum', enum: PosRegisterMode }) registerMode!: PosRegisterMode;
  @Column({ name: 'register_key', type: 'varchar', length: 80 }) registerKey!: string;
  @Column({ name: 'display_name', type: 'varchar', length: 150 }) displayName!: string;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
  @OneToMany(() => PosRegisterSession, (session) => session.register) sessions!: PosRegisterSession[];
}
