import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';

@Entity('tbl_stock_transfer_age_allocation')
@Index('idx_transfer_age_line_date', ['stockTransferLineId', 'originAgingDate'])
export class StockTransferAgeAllocation extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'stock_transfer_age_allocation_id', type: 'bigint' }) stockTransferAgeAllocationId!: number;
  @Column({ name: 'stock_transfer_line_id', type: 'bigint' }) stockTransferLineId!: number;
  @Column({ name: 'origin_aging_date', type: 'date', nullable: true }) originAgingDate!: string | null;
  @Column({ name: 'dispatched_quantity', type: 'decimal', precision: 18, scale: 4 }) dispatchedQuantity!: string;
  @Column({ name: 'received_quantity', type: 'decimal', precision: 18, scale: 4, default: 0 }) receivedQuantity!: string;
}
