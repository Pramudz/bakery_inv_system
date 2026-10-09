import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { Category, } from '../categories/categories.entity';
import { validateCategoryPlacement } from '../categories/categories.service';
import { Brand } from '../brands/brands.entity';
import { UnitOfMeasure } from '../units/units.entity';
import { Supplier } from '../suppliers/suppliers.entity';
import { SupplierService } from '../suppliers/suppliers.service';
import { CreateSupplierDto } from '../suppliers/dto/create-suppliers.dto';
import { PriceList } from '../price-lists/price-lists.entity';
import { Location } from '../locations/locations.entity';
import { ReferenceImportBatch } from './reference-import-batch.entity';
import { SupplierImportRef } from './supplier-import-ref.entity';
import { makeWorkbook, parseWorkbook, RawImportRow, resultDetails, resultWorkbook } from './reference-import.excel';
import { IMPORT_SPECS, Master } from './reference-import.schema';
import { ImportResultRow, validateImportRows } from './reference-import.validation';

const entities = { categories: Category, brands: Brand, units: UnitOfMeasure, suppliers: Supplier, 'price-lists': PriceList, locations: Location };
const codeKey = (value: unknown) => String(value ?? '').trim().toLocaleUpperCase('en-US');

@Injectable()
export class ReferenceImportService {
  constructor(private readonly dataSource: DataSource, private readonly suppliers: SupplierService) {}

  template(master: Master, sample: boolean) { return makeWorkbook(master, sample); }
  async preview(master: Master, tenantId: number, buffer: Buffer) {
    if (!buffer || buffer.length > 5 * 1024 * 1024) throw new BadRequestException('Upload one .xlsx file up to 5 MB.');
    const raw = await parseWorkbook(buffer, master);
    const hash = createHash('sha256').update(buffer).digest('hex');
    const repo = this.dataSource.getRepository(ReferenceImportBatch);
    let batch = await repo.findOneBy({ tenantId, master, fileHash: hash });
    if (!batch) {
      try {
        batch = await repo.save(repo.create({ tenantId, master, fileHash: hash, status: 'PREVIEW', rowsJson: JSON.stringify(raw), resultsJson: null, completedAt: null }));
      } catch (error) {
        if ((error as { code?: string }).code !== 'ER_DUP_ENTRY') throw error;
        batch = await repo.findOneByOrFail({ tenantId, master, fileHash: hash });
      }
    }
    return this.describe(batch, this.dataSource.manager);
  }

  async get(master: Master, tenantId: number, batchId: number) {
    const batch = await this.batch(this.dataSource.manager, master, tenantId, batchId);
    return this.describe(batch, this.dataSource.manager);
  }

  async confirm(master: Master, tenantId: number, batchId: number) {
    return this.dataSource.transaction(async (manager) => {
      const batch = await manager.getRepository(ReferenceImportBatch).findOne({
        where: { batchId, tenantId, master }, lock: { mode: 'pessimistic_write' },
      });
      if (!batch) throw new NotFoundException('Import batch not found.');
      if (batch.status === 'COMPLETED') return this.format(batch, JSON.parse(batch.resultsJson!));
      // Serialize confirmations for this tenant. All validation and writes below share this transaction.
      await manager.query('SELECT tenant_id FROM tbl_tenant WHERE tenant_id = ? FOR UPDATE', [tenantId]);
      const rows = await this.validate(master, tenantId, JSON.parse(batch.rowsJson), manager);
      const ordered = master === 'categories' ? this.categoryOrder(rows)
        : master === 'suppliers' ? [...rows].sort((a, b) => Number(!!b.values.supplierCode) - Number(!!a.values.supplierCode)) : rows;
      const codes = new Map<string, any>();
      if (master === 'categories') {
        for (const category of await manager.getRepository(Category).findBy({ tenantId })) codes.set(codeKey(category.categoryCode), category);
      }
      for (const row of ordered) {
        if (row.action !== 'CREATE') continue;
        const fields = { ...row.values };
        delete fields.parentCategoryCode;
        delete fields.supplierImportRef;
        if (master === 'categories') {
          const parentCode = codeKey(row.values.parentCategoryCode);
          const parent = parentCode ? codes.get(parentCode) : null;
          if (parentCode && !parent) throw new BadRequestException(`Parent category ${parentCode} disappeared during confirmation.`);
          fields.parentCategoryId = parent ? Number(parent.categoryId) : null;
          validateCategoryPlacement([...codes.values()], null, fields.parentCategoryId);
        }
        let saved: any;
        if (master === 'suppliers') {
          saved = await this.suppliers.createWithManager(fields as CreateSupplierDto, tenantId, manager);
          if (row.values.supplierImportRef) {
            const refRepo = manager.getRepository(SupplierImportRef);
            await refRepo.save(refRepo.create({ tenantId, importRef: row.values.supplierImportRef.trim(), supplierId: saved.supplierId, supplierCode: saved.supplierCode }));
          }
        } else {
          const repository = manager.getRepository(entities[master]);
          saved = await repository.save(repository.create({ ...fields, tenantId } as any));
        }
        row.code = String(saved[IMPORT_SPECS[master].codeField]);
        if (master === 'categories') codes.set(codeKey(row.code), saved);
      }
      batch.status = 'COMPLETED';
      batch.resultsJson = JSON.stringify(rows);
      batch.completedAt = new Date();
      await manager.getRepository(ReferenceImportBatch).save(batch);
      return this.format(batch, rows);
    });
  }

  async results(master: Master, tenantId: number, batchId: number) {
    const batch = await this.batch(this.dataSource.manager, master, tenantId, batchId);
    if (batch.status !== 'COMPLETED') throw new BadRequestException('Confirm the import before downloading results.');
    return resultWorkbook(master, JSON.parse(batch.resultsJson!));
  }

  private async batch(manager: EntityManager, master: Master, tenantId: number, batchId: number) {
    const batch = await manager.getRepository(ReferenceImportBatch).findOneBy({ batchId, tenantId, master });
    if (!batch) throw new NotFoundException('Import batch not found.');
    return batch;
  }
  private async describe(batch: ReferenceImportBatch, manager: EntityManager) {
    const rows: ImportResultRow[] = batch.status === 'COMPLETED'
      ? JSON.parse(batch.resultsJson!)
      : await this.validate(batch.master as Master, batch.tenantId, JSON.parse(batch.rowsJson), manager);
    return this.format(batch, rows);
  }
  private format(batch: ReferenceImportBatch, rows: ImportResultRow[]) {
    return {
      batchId: Number(batch.batchId), master: batch.master, status: batch.status,
      counts: { create: rows.filter((r) => r.action === 'CREATE').length, skip: rows.filter((r) => r.action === 'SKIP').length, error: rows.filter((r) => r.action === 'ERROR').length },
      rows: rows.map(({ rowNumber, action, code, errors, details, values }) => ({ rowNumber, action, code, errors, details: batch.status === 'COMPLETED' || action === 'SKIP' ? resultDetails(batch.master as Master, { action, code, errors, details, values }) : details, values })),
    };
  }
  private async validate(master: Master, tenantId: number, raw: RawImportRow[], manager: EntityManager) {
    const existing = await manager.getRepository(entities[master]).findBy({ tenantId } as any);
    const refs = master === 'suppliers' ? await manager.getRepository(SupplierImportRef).findBy({ tenantId }) : [];
    return validateImportRows(master, raw, existing, refs);
  }
  private categoryOrder(rows: ImportResultRow[]) {
    const byCode = new Map(rows.map((row) => [codeKey(row.code), row]));
    const depth = (row: ImportResultRow, seen = new Set<string>()): number => {
      const parent = byCode.get(codeKey(row.values.parentCategoryCode));
      if (!parent || parent.action !== 'CREATE' || seen.has(codeKey(row.code))) return 0;
      return 1 + depth(parent, new Set(seen).add(codeKey(row.code)));
    };
    return [...rows].sort((a, b) => depth(a) - depth(b));
  }
}
