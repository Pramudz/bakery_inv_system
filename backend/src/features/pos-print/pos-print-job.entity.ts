import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('tbl_pos_print_job')
@Index('uq_pos_print_job_document', ['posPrintProfileId', 'documentType', 'sourceId'], { unique: true })
@Index('ix_pos_print_job_queue', ['posPrintProfileId', 'status', 'posPrintJobId'])
export class PosPrintJob {
  @PrimaryGeneratedColumn({ name: 'pos_print_job_id', type: 'bigint' }) posPrintJobId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @Column({ name: 'location_id', type: 'bigint' }) locationId!: number;
  @Column({ name: 'pos_terminal_id', type: 'bigint', nullable: true }) posTerminalId!: number | null;
  @Column({ name: 'pos_print_profile_id', type: 'bigint' }) posPrintProfileId!: number;
  @Column({ name: 'document_type', type: 'varchar', length: 10 }) documentType!: 'SALE' | 'REFUND' | 'TEST';
  @Column({ name: 'source_id', type: 'bigint', nullable: true }) sourceId!: number | null;
  @Column({ name: 'receipt_snapshot', type: 'json' }) receiptSnapshot!: Record<string, any>;
  @Column({ type: 'varchar', length: 20, default: 'PENDING' }) status!: 'PENDING' | 'CLAIMED' | 'PRINTED' | 'FAILED';
  @Column({ type: 'int', unsigned: true, default: 0 }) attempts!: number;
  @Column({ name: 'lease_until', type: 'datetime', precision: 3, nullable: true }) leaseUntil!: Date | null;
  @Column({ name: 'last_error', type: 'varchar', length: 500, nullable: true }) lastError!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3 }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 3 }) updatedAt!: Date;
}
