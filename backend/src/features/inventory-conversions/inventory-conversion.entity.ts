import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Location } from '../locations/locations.entity';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';
import { InventoryConversionLine } from './inventory-conversion-line.entity';

export type InventoryConversionAllocationMethod = 'MANUAL_PERCENT' | 'BY_EXISTING_WAVG' | 'BY_WEIGHT';

@Entity('tbl_inventory_conversion')
@Unique('uq_inventory_conversion_tenant_number', ['tenantId', 'conversionNumber'])
export class InventoryConversion extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'inventory_conversion_id', type: 'bigint' }) inventoryConversionId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @Column({ name: 'conversion_number', type: 'varchar', length: 50, nullable: true }) conversionNumber!: string | null;
  @Column({ name: 'location_id', type: 'bigint' }) locationId!: number;
  @ManyToOne(() => Location, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'location_id' }) location!: Location;
  @Column({ name: 'conversion_date', type: 'date' }) conversionDate!: string;
  @Column({ name: 'allocation_method', type: 'varchar', length: 30 }) allocationMethod!: InventoryConversionAllocationMethod;
  @Column({ type: 'text', nullable: true }) remarks!: string | null;
  @Column({ type: 'varchar', length: 20, default: 'DRAFT' }) status!: string;
  @Column({ name: 'total_input_value', type: 'decimal', precision: 18, scale: 4, nullable: true }) totalInputValue!: string | null;
  @Column({ name: 'total_output_value', type: 'decimal', precision: 18, scale: 4, nullable: true }) totalOutputValue!: string | null;
  @Column({ name: 'value_variance', type: 'decimal', precision: 18, scale: 4, nullable: true }) valueVariance!: string | null;
  @Column({ name: 'created_by_user_id', type: 'bigint' }) createdByUserId!: number;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'created_by_user_id' }) createdByUser!: User;
  @Column({ name: 'posted_by_user_id', type: 'bigint', nullable: true }) postedByUserId!: number | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'posted_by_user_id' }) postedByUser!: User | null;
  @Column({ name: 'posted_at', type: 'datetime', nullable: true }) postedAt!: Date | null;
  @Column({ name: 'cancelled_by_user_id', type: 'bigint', nullable: true }) cancelledByUserId!: number | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'cancelled_by_user_id' }) cancelledByUser!: User | null;
  @Column({ name: 'cancelled_at', type: 'datetime', nullable: true }) cancelledAt!: Date | null;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
  @OneToMany(() => InventoryConversionLine, line => line.inventoryConversion) lines!: InventoryConversionLine[];
}
