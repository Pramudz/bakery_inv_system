import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('tbl_inventory_opening_claim')
@Index('uq_inventory_opening_target', ['tenantId', 'productId', 'locationId'], { unique: true })
export class InventoryOpeningClaim {
  @PrimaryGeneratedColumn({ name: 'inventory_opening_claim_id', type: 'bigint' }) inventoryOpeningClaimId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @Column({ name: 'product_id', type: 'bigint' }) productId!: number;
  @Column({ name: 'location_id', type: 'bigint' }) locationId!: number;
  @Column({ name: 'source_import_batch_id', type: 'bigint', nullable: true }) sourceImportBatchId!: number | null;
  @Column({ name: 'source_adjustment_id', type: 'bigint' }) sourceAdjustmentId!: number;
  @Column({ name: 'source_adjustment_line_id', type: 'bigint' }) sourceAdjustmentLineId!: number;
  @Column({ name: 'created_by_user_id', type: 'bigint' }) createdByUserId!: number;
  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
}
