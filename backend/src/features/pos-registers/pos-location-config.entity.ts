import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Location } from '../locations/locations.entity';
import { Tenant } from '../tenants/tenant.entity';

export enum PosRegisterMode {
  TERMINAL_REGISTER = 'TERMINAL_REGISTER',
  MASTER_REGISTER = 'MASTER_REGISTER',
}

@Entity('tbl_pos_location_config')
@Index('uq_pos_location_config_location', ['locationId'], { unique: true })
@Index('ix_pos_location_config_tenant', ['tenantId'])
export class PosLocationConfig extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'pos_location_config_id', type: 'bigint' }) posLocationConfigId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @Column({ name: 'location_id', type: 'bigint' }) locationId!: number;
  @ManyToOne(() => Location, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'location_id' }) location!: Location;
  @Column({ name: 'register_mode', type: 'enum', enum: PosRegisterMode }) registerMode!: PosRegisterMode;
}
