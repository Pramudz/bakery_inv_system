import assert from 'node:assert/strict';
import test from 'node:test';
import { Brand } from '../brands/brands.entity';
import { Category } from '../categories/categories.entity';
import { Supplier } from '../suppliers/suppliers.entity';
import { UnitOfMeasure } from '../units/units.entity';
import { PriceList } from '../price-lists/price-lists.entity';
import { Location } from '../locations/locations.entity';
import ExcelJS from 'exceljs';
import { ReferenceImportBatch } from './reference-import-batch.entity';
import { SupplierImportRef } from './supplier-import-ref.entity';
import { ReferenceImportService } from './reference-import.service';
import { makeWorkbook } from './reference-import.excel';

type State = { batches: any[]; categories: any[]; brands: any[]; units: any[]; suppliers: any[]; priceLists: any[]; locations: any[]; refs: any[]; nextSupplier: number };
function fixture(failBrand = false) {
  let state: State = { batches: [], categories: [], brands: [], units: [], suppliers: [], priceLists: [], locations: [], refs: [], nextSupplier: 0 };
  const matching = (row: any, where: any) => Object.entries(where).every(([key, value]) => String(row[key]) === String(value));
  const manager = (work: State): any => ({
    state: work,
    query: async () => [{ tenant_id: 7 }],
    getRepository(entity: any) {
      const key = entity === ReferenceImportBatch ? 'batches' : entity === Category ? 'categories' : entity === Brand ? 'brands' : entity === UnitOfMeasure ? 'units' : entity === Supplier ? 'suppliers' : entity === PriceList ? 'priceLists' : entity === Location ? 'locations' : entity === SupplierImportRef ? 'refs' : '';
      if (!key) throw Error(`Unexpected repository: ${entity.name}`);
      const records = work[key as 'batches' | 'categories' | 'brands' | 'units' | 'suppliers' | 'priceLists' | 'locations' | 'refs'];
      return {
        create: (row: any) => row,
        findBy: async (where: any) => records.filter((row: any) => matching(row, where)),
        findOneBy: async (where: any) => records.find((row: any) => matching(row, where)) ?? null,
        findOneByOrFail: async (where: any) => records.find((row: any) => matching(row, where)) ?? Promise.reject(Error('Missing batch')),
        findOne: async ({ where }: any) => records.find((row: any) => matching(row, where)) ?? null,
        save: async (row: any) => {
          if (entity === Brand && failBrand && row.brandCode === 'HILLSIDE') throw Error('Simulated database failure');
          const id = entity === ReferenceImportBatch ? 'batchId' : entity === Category ? 'categoryId' : entity === Brand ? 'brandId' : entity === UnitOfMeasure ? 'unitId' : entity === Supplier ? 'supplierId' : entity === PriceList ? 'priceListId' : entity === Location ? 'locationId' : 'id';
          if (!row[id]) { row[id] = records.length + 1; records.push(row); }
          return row;
        },
      };
    },
  });
  const dataSource: any = {
    get manager() { return manager(state); },
    getRepository(entity: any) { return manager(state).getRepository(entity); },
    async transaction(callback: (manager: any) => Promise<any>) {
      const copy: State = structuredClone(state);
      const result = await callback(manager(copy));
      state = copy;
      return result;
    },
  };
  const supplierService: any = {
    async createWithManager(dto: any, tenantId: number, transactionalManager: any) {
      const number = ++transactionalManager.state.nextSupplier;
      return transactionalManager.getRepository(Supplier).save({ ...dto, tenantId, supplierCode: dto.supplierCode || `SUP-${String(number).padStart(6, '0')}` });
    },
  };
  return { service: new ReferenceImportService(dataSource, supplierService), state: () => state };
}

test('preview only persists the batch; repeated confirmation returns the same brand results', async () => {
  const { service, state } = fixture();
  const uploaded = await service.preview('brands', 7, await makeWorkbook('brands', true));
  assert.equal(uploaded.status, 'PREVIEW');
  assert.equal(uploaded.counts.create, 2);
  assert.equal(state().brands.length, 0);
  await assert.rejects(service.results('brands', 7, uploaded.batchId), /Confirm the import/);
  const first = await service.confirm('brands', 7, uploaded.batchId);
  assert.equal(first.status, 'COMPLETED');
  assert.equal(state().brands.length, 2);
  const resultFile = new ExcelJS.Workbook();
  await resultFile.xlsx.load(await service.results('brands', 7, uploaded.batchId) as any);
  assert.equal(resultFile.getWorksheet('Results')!.getRow(2).getCell(3).value, 'SUNRISE');
  const again = await service.confirm('brands', 7, uploaded.batchId);
  assert.deepEqual(again, first);
  assert.equal(state().brands.length, 2);
  const changed = new ExcelJS.Workbook();
  await changed.xlsx.load(await makeWorkbook('brands', true) as any);
  changed.getWorksheet('Data')!.getRow(2).getCell(3).value = 'Edited upload, same code';
  assert.equal((await service.preview('brands', 7, Buffer.from(await changed.xlsx.writeBuffer()))).counts.skip, 2);
  await assert.rejects(service.get('brands', 8, uploaded.batchId), /not found/);
});

test('validation errors remain row-level results while valid rows commit', async () => {
  const { service, state } = fixture();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await makeWorkbook('brands', true) as any);
  workbook.getWorksheet('Data')!.getRow(3).getCell(2).value = '';
  const preview = await service.preview('brands', 7, Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.deepEqual(preview.counts, { create: 1, skip: 0, error: 1 });
  const confirmed = await service.confirm('brands', 7, preview.batchId);
  assert.deepEqual(confirmed.counts, { create: 1, skip: 0, error: 1 });
  assert.equal(state().brands.length, 1);
  const results = new ExcelJS.Workbook();
  await results.xlsx.load(await service.results('brands', 7, preview.batchId) as any);
  assert.equal(results.getWorksheet('Results')!.getRow(3).getCell(2).value, 'ERROR');
});

for (const [master, key] of [['units', 'units'], ['price-lists', 'priceLists'], ['locations', 'locations']] as const) {
  test(`${master}: preview and confirmation create sample records once`, async () => {
    const { service, state } = fixture();
    const preview = await service.preview(master, 7, await makeWorkbook(master, true));
    assert.equal(state()[key].length, 0);
    assert.equal(preview.counts.create, 2);
    const confirmed = await service.confirm(master, 7, preview.batchId);
    assert.equal(confirmed.status, 'COMPLETED');
    assert.equal(state()[key].length, 2);
    await service.confirm(master, 7, preview.batchId);
    assert.equal(state()[key].length, 2);
  });
}

test('supplier generated codes are mapped to stable references and retried safely', async () => {
  const { service, state } = fixture();
  const firstFile = await makeWorkbook('suppliers', true);
  const preview = await service.preview('suppliers', 7, firstFile);
  assert.equal(state().suppliers.length, 0);
  const imported = await service.confirm('suppliers', 7, preview.batchId);
  assert.deepEqual(imported.rows.map((row: any) => row.code), ['SUP-000001', 'SUP-000002']);
  assert.equal(state().refs.length, 2);
  assert.equal(state().nextSupplier, 2);
  const repeat = await service.preview('suppliers', 7, firstFile);
  assert.equal(repeat.status, 'COMPLETED');
  assert.equal((await service.confirm('suppliers', 7, repeat.batchId)).counts.create, 2);
  assert.equal(state().nextSupplier, 2);
  const edited = new ExcelJS.Workbook();
  await edited.xlsx.load(firstFile as any);
  edited.getWorksheet('Data')!.getRow(2).getCell(3).value = 'Renamed on a retry';
  const retry = await service.preview('suppliers', 7, Buffer.from(await edited.xlsx.writeBuffer()));
  assert.equal(retry.counts.skip, 2);
  assert.deepEqual(retry.rows.map((row: any) => row.code), ['SUP-000001', 'SUP-000002']);
  await assert.rejects(service.results('suppliers', 8, preview.batchId), /not found/);
});

test('unexpected write failure rolls back all valid rows and leaves preview confirmable', async () => {
  const { service, state } = fixture(true);
  const preview = await service.preview('brands', 7, await makeWorkbook('brands', true));
  await assert.rejects(service.confirm('brands', 7, preview.batchId), /Simulated database failure/);
  assert.equal(state().brands.length, 0);
  assert.equal(state().batches[0].status, 'PREVIEW');
});

test('category confirmation creates in-file parents before children regardless of Excel order', async () => {
  const { service, state } = fixture();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await makeWorkbook('categories', true) as any);
  const sheet = workbook.getWorksheet('Data')!;
  sheet.getRow(2).getCell(1).value = 'BREAD';
  sheet.getRow(2).getCell(2).value = 'Bread';
  sheet.getRow(2).getCell(3).value = 'BAKERY';
  sheet.getRow(3).getCell(1).value = 'BAKERY';
  sheet.getRow(3).getCell(2).value = 'Bakery';
  sheet.getRow(3).getCell(3).value = '';
  const preview = await service.preview('categories', 7, Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.equal(preview.counts.create, 3);
  await service.confirm('categories', 7, preview.batchId);
  assert.deepEqual(state().categories.map((row) => row.categoryCode), ['BAKERY', 'BREAD', 'WHOLEGRAIN']);
  assert.equal(state().categories[1].parentCategoryId, state().categories[0].categoryId);
  assert.equal(state().categories[2].parentCategoryId, state().categories[1].categoryId);
});
