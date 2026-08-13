import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';

import { AuditEntity } from '../../common/audit.entity';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';
import { Location } from '../locations/locations.entity';

@Entity('tbl_user_location')
@Unique(['tenantId', 'userId', 'locationId'])
export class UserLocation extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'user_location_id', type: 'bigint' }) userLocationId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @Column({ name: 'user_id', type: 'bigint' }) userId!: number;
  @Column({ name: 'location_id', type: 'bigint' }) locationId!: number;
  @Column({ name: 'is_default', default: false }) isDefault!: boolean;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;

  @ManyToOne(() => Tenant, (tenant) => tenant.userLocations, { nullable: false })
  @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @ManyToOne(() => User, (user) => user.userLocations, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' }) user!: User;
  @ManyToOne(() => Location, (location) => location.userLocations, { nullable: false })
  @JoinColumn({ name: 'location_id' }) location!: Location;
}
