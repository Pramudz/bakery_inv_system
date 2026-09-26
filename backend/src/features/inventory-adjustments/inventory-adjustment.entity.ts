import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Location } from '../locations/locations.entity';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';
import { InventoryAdjustmentLine } from './inventory-adjustment-line.entity';
import { InventoryAdjustmentReason } from './inventory-adjustment-reason.entity';

export type InventoryAdjustmentMovement = 'ADJI' | 'ADJO';

@Entity('tbl_inventory_adjustment')
@Unique('uq_inventory_adjustment_tenant_number', ['tenantId', 'adjustmentNumber'])
export class InventoryAdjustment extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'inventory_adjustment_id', type: 'bigint' }) inventoryAdjustmentId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @Column({ name: 'adjustment_number', type: 'varchar', length: 50, nullable: true }) adjustmentNumber!: string | null;
  @Column({ name: 'location_id', type: 'bigint' }) locationId!: number;
  @ManyToOne(() => Location, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'location_id' }) location!: Location;
  @Column({ name: 'movement_type', type: 'varchar', length: 10 }) movementType!: InventoryAdjustmentMovement;
  @Column({ name: 'reason_id', type: 'bigint' }) reasonId!: number;
  @ManyToOne(() => InventoryAdjustmentReason, reason => reason.adjustments, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'reason_id' }) reason!: InventoryAdjustmentReason;
  @Column({ name: 'adjustment_date', type: 'date' }) adjustmentDate!: string;
  @Column({ name: 'reference_number', type: 'varchar', length: 100, nullable: true }) referenceNumber!: string | null;
  @Column({ type: 'text', nullable: true }) remarks!: string | null;
  @Column({ type: 'varchar', length: 20, default: 'DRAFT' }) status!: string;
  @Column({ name: 'created_by_user_id', type: 'bigint' }) createdByUserId!: number;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'created_by_user_id' }) createdByUser!: User;
  @Column({ name: 'posted_by_user_id', type: 'bigint', nullable: true }) postedByUserId!: number | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'posted_by_user_id' }) postedByUser!: User | null;
  @Column({ name: 'posted_at', type: 'datetime', nullable: true }) postedAt!: Date | null;
  @Column({ name: 'cancelled_by_user_id', type: 'bigint', nullable: true }) cancelledByUserId!: number | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'cancelled_by_user_id' }) cancelledByUser!: User | null;
  @Column({ name: 'cancelled_at', type: 'datetime', nullable: true }) cancelledAt!: Date | null;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
  @OneToMany(() => InventoryAdjustmentLine, line => line.inventoryAdjustment) lines!: InventoryAdjustmentLine[];
}
