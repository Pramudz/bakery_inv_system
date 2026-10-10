import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('tbl_product_import_batch')
@Index('uq_product_import_file', ['tenantId', 'importType', 'datasetId', 'fileHash'], { unique: true })
export class ProductImportBatch {
  @PrimaryGeneratedColumn({ name: 'batch_id', type: 'bigint' }) batchId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @Column({ name: 'import_type', type: 'varchar', length: 40 }) importType!: string;
  @Column({ name: 'dataset_id', type: 'varchar', length: 100 }) datasetId!: string;
  @Column({ name: 'file_hash', type: 'char', length: 64 }) fileHash!: string;
  @Column({ name: 'status', type: 'varchar', length: 20 }) status!: 'PREVIEW' | 'COMPLETED';
  @Column({ name: 'rows_json', type: 'longtext' }) rowsJson!: string;
  @Column({ name: 'preview_json', type: 'longtext', nullable: true }) previewJson!: string | null;
  @Column({ name: 'results_json', type: 'longtext', nullable: true }) resultsJson!: string | null;
  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
  @Column({ name: 'completed_at', type: 'datetime', nullable: true }) completedAt!: Date | null;
}
