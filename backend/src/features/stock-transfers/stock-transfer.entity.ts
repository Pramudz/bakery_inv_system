import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';

export type StockTransferStatus = 'DRAFT' | 'DISPATCHED' | 'PART_RECEIVED' | 'RECEIVED' | 'CANCELLED';

@Entity('tbl_stock_transfer')
@Unique('uq_stock_transfer_tenant_number', ['tenantId', 'transferNumber'])
@Unique('uq_stock_transfer_dispatch_key', ['tenantId', 'dispatchKey'])
@Index('idx_stock_transfer_tenant_status', ['tenantId', 'status'])
@Index('idx_stock_transfer_source', ['tenantId', 'sourceLocationId'])
@Index('idx_stock_transfer_destination', ['tenantId', 'destinationLocationId'])
export class StockTransfer extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'stock_transfer_id', type: 'bigint' }) stockTransferId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @Column({ name: 'transfer_number', type: 'varchar', length: 50 }) transferNumber!: string;
  @Column({ name: 'source_location_id', type: 'bigint' }) sourceLocationId!: number;
  @Column({ name: 'destination_location_id', type: 'bigint' }) destinationLocationId!: number;
  @Column({ type: 'varchar', length: 20, default: 'DRAFT' }) status!: StockTransferStatus;
  @Column({ name: 'transfer_date', type: 'date' }) transferDate!: string;
  @Column({ name: 'dispatch_business_date', type: 'date', nullable: true }) dispatchBusinessDate!: string | null;
  @Column({ name: 'receipt_completed_business_date', type: 'date', nullable: true }) receiptCompletedBusinessDate!: string | null;
  @Column({ name: 'dispatched_at', type: 'datetime', nullable: true }) dispatchedAt!: Date | null;
  @Column({ name: 'dispatched_by_user_id', type: 'bigint', nullable: true }) dispatchedByUserId!: number | null;
  @Column({ name: 'received_completed_at', type: 'datetime', nullable: true }) receivedCompletedAt!: Date | null;
  @Column({ name: 'received_completed_by_user_id', type: 'bigint', nullable: true }) receivedCompletedByUserId!: number | null;
  @Column({ name: 'dispatch_key', type: 'char', length: 36, nullable: true }) dispatchKey!: string | null;
  @Column({ name: 'dispatch_fingerprint', type: 'char', length: 64, nullable: true }) dispatchFingerprint!: string | null;
  @Column({ name: 'dispatch_reference', type: 'varchar', length: 100, nullable: true }) dispatchReference!: string | null;
  @Column({ name: 'carrier_reference', type: 'varchar', length: 100, nullable: true }) carrierReference!: string | null;
  @Column({ name: 'tracking_reference', type: 'varchar', length: 100, nullable: true }) trackingReference!: string | null;
  @Column({ name: 'vehicle_reference', type: 'varchar', length: 100, nullable: true }) vehicleReference!: string | null;
  @Column({ name: 'expected_arrival_date', type: 'date', nullable: true }) expectedArrivalDate!: string | null;
  @Column({ type: 'text', nullable: true }) remarks!: string | null;
  @Column({ name: 'created_by_user_id', type: 'bigint' }) createdByUserId!: number;
  @Column({ name: 'cancelled_at', type: 'datetime', nullable: true }) cancelledAt!: Date | null;
  @Column({ name: 'cancelled_by_user_id', type: 'bigint', nullable: true }) cancelledByUserId!: number | null;
}
