import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';

@Entity('tbl_stock_transfer_receipt_line')
@Index('uq_stock_transfer_receipt_line', ['stockTransferReceiptId', 'stockTransferLineId'], { unique: true })
export class StockTransferReceiptLine extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'stock_transfer_receipt_line_id', type: 'bigint' }) stockTransferReceiptLineId!: number;
  @Column({ name: 'stock_transfer_receipt_id', type: 'bigint' }) stockTransferReceiptId!: number;
  @Column({ name: 'stock_transfer_line_id', type: 'bigint' }) stockTransferLineId!: number;
  @Column({ name: 'received_quantity', type: 'decimal', precision: 18, scale: 4 }) receivedQuantity!: string;
  @Column({ name: 'received_value', type: 'decimal', precision: 18, scale: 4 }) receivedValue!: string;
}
