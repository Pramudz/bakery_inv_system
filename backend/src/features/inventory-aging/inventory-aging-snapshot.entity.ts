import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('tbl_inventory_aging_snapshot')
@Index('uq_inventory_aging_snapshot_scope', ['tenantId', 'snapshotDate', 'locationId', 'productId'], { unique: true })
export class InventoryAgingSnapshot {
  @PrimaryGeneratedColumn({ name: 'inventory_aging_snapshot_id', type: 'bigint' }) inventoryAgingSnapshotId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @Column({ name: 'snapshot_date', type: 'date' }) snapshotDate!: string;
  @Column({ name: 'location_id', type: 'bigint' }) locationId!: number;
  @Column({ name: 'product_id', type: 'bigint' }) productId!: number;
  @Column({ name: 'quantity_on_hand', type: 'decimal', precision: 18, scale: 4 }) quantityOnHand!: string;
  @Column({ name: 'average_cost', type: 'decimal', precision: 18, scale: 4 }) averageCost!: string;
  @Column({ name: 'inventory_value', type: 'decimal', precision: 18, scale: 4 }) inventoryValue!: string;
  @Column({ name: 'qty_0_30', type: 'decimal', precision: 18, scale: 4 }) qty0to30!: string;
  @Column({ name: 'qty_31_60', type: 'decimal', precision: 18, scale: 4 }) qty31to60!: string;
  @Column({ name: 'qty_61_90', type: 'decimal', precision: 18, scale: 4 }) qty61to90!: string;
  @Column({ name: 'qty_91_180', type: 'decimal', precision: 18, scale: 4 }) qty91to180!: string;
  @Column({ name: 'qty_181_365', type: 'decimal', precision: 18, scale: 4 }) qty181to365!: string;
  @Column({ name: 'qty_365_plus', type: 'decimal', precision: 18, scale: 4 }) qty365plus!: string;
  @Column({ name: 'unknown_qty', type: 'decimal', precision: 18, scale: 4 }) unknownQty!: string;
  @Column({ name: 'attributed_qty', type: 'decimal', precision: 18, scale: 4 }) attributedQty!: string;
  @Column({ name: 'aging_coverage_percentage', type: 'decimal', precision: 7, scale: 4 }) agingCoveragePercentage!: string;
  @Column({ name: 'average_age_days', type: 'decimal', precision: 12, scale: 4, nullable: true }) averageAgeDays!: string | null;
  @Column({ name: 'oldest_age_days', type: 'int', nullable: true }) oldestAgeDays!: number | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
