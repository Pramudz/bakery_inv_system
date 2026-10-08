import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';

@Entity('tbl_stock_transfer_line')
@Index('uq_stock_transfer_line_number', ['stockTransferId', 'lineNumber'], { unique: true })
export class StockTransferLine extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'stock_transfer_line_id', type: 'bigint' }) stockTransferLineId!: number;
  @Column({ name: 'stock_transfer_id', type: 'bigint' }) stockTransferId!: number;
  @Column({ name: 'line_number', type: 'int' }) lineNumber!: number;
  @Column({ name: 'product_id', type: 'bigint' }) productId!: number;
  @Column({ name: 'unit_id', type: 'bigint' }) unitId!: number;
  @Column({ name: 'requested_quantity', type: 'decimal', precision: 18, scale: 4 }) requestedQuantity!: string;
  @Column({ name: 'dispatched_quantity', type: 'decimal', precision: 18, scale: 4, default: 0 }) dispatchedQuantity!: string;
  @Column({ name: 'received_quantity', type: 'decimal', precision: 18, scale: 4, default: 0 }) receivedQuantity!: string;
  @Column({ name: 'unit_cost_snapshot', type: 'decimal', precision: 18, scale: 4, nullable: true }) unitCostSnapshot!: string | null;
  @Column({ name: 'transfer_value', type: 'decimal', precision: 18, scale: 4, nullable: true }) transferValue!: string | null;
}
