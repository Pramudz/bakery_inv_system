import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('tbl_supplier_import_ref')
@Index('uq_supplier_import_ref', ['tenantId', 'importRef'], { unique: true })
export class SupplierImportRef {
  @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' }) id!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @Column({ name: 'import_ref', type: 'varchar', length: 100 }) importRef!: string;
  @Column({ name: 'supplier_id', type: 'bigint' }) supplierId!: number;
  @Column({ name: 'supplier_code', type: 'varchar', length: 50 }) supplierCode!: string;
}
