import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('tbl_reference_import_batch')
@Index('uq_reference_import_file', ['tenantId', 'master', 'fileHash'], { unique: true })
export class ReferenceImportBatch {
  @PrimaryGeneratedColumn({ name: 'batch_id', type: 'bigint' }) batchId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @Column({ name: 'master', type: 'varchar', length: 30 }) master!: string;
  @Column({ name: 'file_hash', type: 'char', length: 64 }) fileHash!: string;
  @Column({ name: 'status', type: 'varchar', length: 20 }) status!: 'PREVIEW' | 'COMPLETED';
  @Column({ name: 'rows_json', type: 'longtext' }) rowsJson!: string;
  @Column({ name: 'results_json', type: 'longtext', nullable: true }) resultsJson!: string | null;
  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
  @Column({ name: 'completed_at', type: 'datetime', nullable: true }) completedAt!: Date | null;
}
