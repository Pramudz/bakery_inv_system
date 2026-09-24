import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Tenant } from '../tenants/tenant.entity';
import { InventoryAdjustment } from './inventory-adjustment.entity';

export type AdjustmentDirection = 'IN' | 'OUT' | 'BOTH';
export type AdjustmentCostingPolicy = 'CURRENT_WAVG' | 'MANUAL_REQUIRED';

@Entity('tbl_inventory_adjustment_reason')
@Unique('uq_inventory_adjustment_reason_tenant_code', ['tenantId', 'code'])
export class InventoryAdjustmentReason extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'inventory_adjustment_reason_id', type: 'bigint' }) inventoryAdjustmentReasonId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' }) @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @Column({ type: 'varchar', length: 50 }) code!: string;
  @Column({ type: 'varchar', length: 150 }) name!: string;
  @Column({ name: 'allowed_direction', type: 'varchar', length: 10 }) allowedDirection!: AdjustmentDirection;
  @Column({ name: 'reason_category', type: 'varchar', length: 100, nullable: true }) reasonCategory!: string | null;
  @Column({ name: 'costing_policy', type: 'varchar', length: 30 }) costingPolicy!: AdjustmentCostingPolicy;
  @Column({ name: 'requires_remarks', default: false }) requiresRemarks!: boolean;
  @Column({ name: 'requires_approval', default: false }) requiresApproval!: boolean;
  @Column({ name: 'is_system_reason', default: false }) isSystemReason!: boolean;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
  @OneToMany(() => InventoryAdjustment, adjustment => adjustment.reason) adjustments!: InventoryAdjustment[];
}
