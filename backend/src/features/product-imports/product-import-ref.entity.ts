import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('tbl_product_import_ref')
@Index('uq_product_import_ref', ['tenantId', 'datasetId', 'importKey'], { unique: true })
export class ProductImportRef {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' }) id!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @Column({ name: 'dataset_id', type: 'varchar', length: 100 }) datasetId!: string;
  @Column({ name: 'import_key', type: 'varchar', length: 100 }) importKey!: string;
  @Column({ name: 'product_id', type: 'bigint' }) productId!: number;
  @Column({ name: 'sku', type: 'varchar', length: 100 }) sku!: string;
  @Column({ name: 'definition_hash', type: 'char', length: 64 }) definitionHash!: string;
  @Column({ name: 'batch_id', type: 'bigint' }) batchId!: number;
}
