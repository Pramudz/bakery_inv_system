import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';

@Entity('tbl_stock_transfer_receipt')
@Unique('uq_stock_transfer_receipt_key', ['tenantId', 'receiptKey'])
@Index('idx_stock_transfer_receipt_transfer', ['stockTransferId'])
export class StockTransferReceipt extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'stock_transfer_receipt_id', type: 'bigint' }) stockTransferReceiptId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @Column({ name: 'stock_transfer_id', type: 'bigint' }) stockTransferId!: number;
  @Column({ name: 'receipt_key', type: 'char', length: 36 }) receiptKey!: string;
  @Column({ name: 'request_fingerprint', type: 'char', length: 64 }) requestFingerprint!: string;
  @Column({ name: 'received_business_date', type: 'date' }) receivedBusinessDate!: string;
  @Column({ name: 'received_at', type: 'datetime' }) receivedAt!: Date;
  @Column({ name: 'received_by_user_id', type: 'bigint' }) receivedByUserId!: number;
  @Column({ name: 'result_snapshot', type: 'json', nullable: true }) resultSnapshot!: { receiptId: number; transfer: any } | null;
}
