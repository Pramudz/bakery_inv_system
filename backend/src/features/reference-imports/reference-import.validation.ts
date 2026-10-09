import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateCategoryDto } from '../categories/dto/create-categories.dto';
import { CreateBrandDto } from '../brands/dto/create-brands.dto';
import { CreateUnitOfMeasureDto } from '../units/dto/create-units.dto';
import { CreateSupplierDto } from '../suppliers/dto/create-suppliers.dto';
import { CreatePriceListDto } from '../price-lists/dto/create-price-lists.dto';
import { CreateLocationDto } from '../locations/dto/create-locations.dto';
import { normalizedPriceListType } from '../invoices/pos-pricing.service';
import { RawImportRow } from './reference-import.excel';
import { IMPORT_SPECS, Master } from './reference-import.schema';

export interface ImportResultRow {
  rowNumber: number;
  action: 'CREATE' | 'SKIP' | 'ERROR';
  code: string;
  errors: string[];
  details: string;
  values: Record<string, any>;
}
const dtos = { categories: CreateCategoryDto, brands: CreateBrandDto, units: CreateUnitOfMeasureDto, suppliers: CreateSupplierDto, 'price-lists': CreatePriceListDto, locations: CreateLocationDto };
const norm = (value: unknown) => String(value ?? '').trim().toLocaleUpperCase('en-US');
const singular: Record<Master, string> = { categories: 'category', brands: 'brand', units: 'unit', suppliers: 'supplier', 'price-lists': 'price list', locations: 'location' };

export function validateImportRows(master: Master, raw: RawImportRow[], existing: any[], supplierRefs: Array<{ importRef: string; supplierCode: string }> = []): ImportResultRow[] {
  const spec = IMPORT_SPECS[master];
  const codeField = spec.codeField;
  const existingByCode = new Map<string, any>(existing.map((row) => [norm(row[codeField]), row]));
  const existingRefs = new Map(supplierRefs.map((row) => [norm(row.importRef), row.supplierCode]));
  const seenCodes = new Map<string, number>();
  const seenRefs = new Map<string, number>();
  const seenNames = new Map<string, number>();
  const results: ImportResultRow[] = [];
  for (const source of raw) {
    const values: Record<string, any> = {};
    const errors: string[] = [];
    for (const column of spec.columns) {
      const input = source.values[column.field];
      if (input === null || input === undefined || String(input).trim() === '') {
        if (column.required) errors.push(`${column.header} is required.`);
        continue;
      }
      let value: any;
      if (column.type === 'boolean') {
        if (input === true || norm(input) === 'TRUE') value = true;
        else if (input === false || norm(input) === 'FALSE') value = false;
        else { errors.push(`${column.header} must be TRUE or FALSE.`); continue; }
      } else if (column.type === 'integer') {
        value = Number(input);
        if (!Number.isSafeInteger(value)) { errors.push(`${column.header} must be a whole number.`); continue; }
        if (column.field === 'quantityPrecision' && (value < 0 || value > 6)) { errors.push('QuantityPrecision must be from 0 to 6.'); continue; }
        if (column.field === 'sortOrder' && (value < -2147483648 || value > 2147483647)) { errors.push('SortOrder is outside the supported integer range.'); continue; }
      } else {
        if (typeof input !== 'string') { errors.push(`${column.header} must be text.`); continue; }
        value = input.trim();
        if (column.max && value.length > column.max) errors.push(`${column.header} exceeds ${column.max} characters.`);
        if (column.type === 'enum' && !column.values!.includes(norm(value))) errors.push(`${column.header} must be one of: ${column.values!.join(', ')}.`);
        if (column.type === 'enum') value = norm(value);
      }
      values[column.field] = value;
    }
    if (master === 'locations') {
      if (values.code) values.code = norm(values.code);
      if (values.countryCode) values.countryCode = norm(values.countryCode);
    }
    if (master === 'suppliers') {
      if (values.supplierCode) values.supplierCode = norm(values.supplierCode);
      if (values.countryCode) values.countryCode = norm(values.countryCode);
      if (!values.supplierCode && !values.supplierImportRef) errors.push('Supplier Reference is required when SupplierCode is blank.');
      if (values.supplierImportRef) {
        const ref = norm(values.supplierImportRef);
        if (seenRefs.has(ref)) errors.push(`Supplier Reference duplicates Excel row ${seenRefs.get(ref)}.`);
        else seenRefs.set(ref, source.rowNumber);
        if (values.supplierCode && existingRefs.has(ref) && norm(existingRefs.get(ref)) !== norm(values.supplierCode)) errors.push('Supplier Reference already maps to another code.');
      }
    }
    if (master === 'price-lists') {
      if (values.currencyCode) values.currencyCode = norm(values.currencyCode);
      else values.currencyCode = 'LKR';
      if (!/^[A-Z]{3}$/.test(values.currencyCode)) errors.push('CurrencyCode must be a three-letter currency code.');
    }
    const code = String(values[codeField] ?? '');
    if (code) {
      const key = norm(code);
      if (seenCodes.has(key)) errors.push(`${spec.columns[0].header} duplicates Excel row ${seenCodes.get(key)}.`);
      else seenCodes.set(key, source.rowNumber);
    }
    if (master === 'categories' && values.categoryName) {
      const name = norm(values.categoryName);
      const matchingName = existing.find((row) => norm(row.categoryName) === name);
      if (matchingName && norm(matchingName.categoryCode) !== norm(code)) errors.push('CategoryName already exists in this tenant.');
      if (seenNames.has(name)) errors.push(`CategoryName duplicates Excel row ${seenNames.get(name)}.`);
      else seenNames.set(name, source.rowNumber);
    }
    const dtoValues = { ...values };
    delete dtoValues.parentCategoryCode;
    delete dtoValues.supplierImportRef;
    const instance = plainToInstance(dtos[master] as any, dtoValues);
    for (const error of validateSync(instance as object, { whitelist: true, forbidNonWhitelisted: true })) {
      if (error.constraints) errors.push(`${error.property}: ${Object.values(error.constraints).join(', ')}`);
    }
    const mappedCode = !code && master === 'suppliers' && values.supplierImportRef ? existingRefs.get(norm(values.supplierImportRef)) : undefined;
    const action = errors.length ? 'ERROR' : code && existingByCode.has(norm(code)) || mappedCode ? 'SKIP' : 'CREATE';
    let details = '';
    if (action === 'SKIP') {
      const existingRow = existingByCode.get(norm(code || mappedCode));
      const changed = existingRow && spec.columns.some((column) => column.field !== 'supplierImportRef' && values[column.field] !== undefined && norm(values[column.field]) !== norm(existingRow[column.field]));
      details = mappedCode && !code
        ? `Skipped: supplier reference ${values.supplierImportRef} was previously imported as ${mappedCode}.`
        : `Skipped: ${singular[master]} code ${code} already exists.`;
      details += changed ? ' Uploaded values differ; the existing record was not updated.' : ' Existing records are not updated.';
    }
    results.push({ rowNumber: source.rowNumber, action, code: code || mappedCode || '', errors, details, values });
  }
  if (master === 'categories') validateCategoryRows(results, existing);
  if (master === 'price-lists') validateDefaultPriceLists(results, existing);
  return results;
}

function invalidate(row: ImportResultRow, message: string) { if (!row.errors.includes(message)) row.errors.push(message); row.action = 'ERROR'; }

function validateCategoryRows(rows: ImportResultRow[], existing: any[]) {
  const byCode = new Map(rows.map((row) => [norm(row.code), row]));
  const existingByCode = new Map(existing.map((row) => [norm(row.categoryCode), row]));
  const existingById = new Map(existing.map((row) => [String(row.categoryId), row]));
  const depthOfExisting = (row: any, seen = new Set<string>()): number => {
    const key = String(row.categoryId);
    if (seen.has(key)) return 4;
    if (row.parentCategoryId == null) return 1;
    const parent = existingById.get(String(row.parentCategoryId));
    return parent ? 1 + depthOfExisting(parent, new Set(seen).add(key)) : 4;
  };
  const depthOf = (row: ImportResultRow, seen = new Set<string>()): number => {
    const key = norm(row.code);
    if (seen.has(key)) { invalidate(row, 'Category hierarchy contains a cycle.'); return 4; }
    const parentCode = norm(row.values.parentCategoryCode);
    if (!parentCode) return 1;
    const parentExisting = existingByCode.get(parentCode);
    if (parentExisting) return 1 + depthOfExisting(parentExisting);
    const parent = byCode.get(parentCode);
    if (!parent) { invalidate(row, `ParentCategoryCode ${parentCode} was not found in this tenant or file.`); return 4; }
    if (parent.action === 'ERROR') { invalidate(row, `ParentCategoryCode ${parentCode} has validation errors.`); return 4; }
    const depth = 1 + depthOf(parent, new Set(seen).add(key));
    if (parent.errors.length) invalidate(row, `ParentCategoryCode ${parentCode} has validation errors.`);
    return depth;
  };
  for (const row of rows) {
    if (row.action !== 'CREATE') continue;
    if (depthOf(row) > 3) invalidate(row, 'Category hierarchy supports a maximum of 3 levels.');
  }
  // A parent can become invalid after a child was visited, so propagate once more.
  for (const row of rows) if (row.action === 'CREATE') depthOf(row);
}

function validateDefaultPriceLists(rows: ImportResultRow[], existing: any[]) {
  const requested = new Map<string, number>();
  for (const row of rows) if (row.action === 'CREATE' && row.values.isDefault) {
    const type = normalizedPriceListType(row.values.priceListType);
    if (type === 'RETAIL' || type === 'WHOLESALE') requested.set(type, (requested.get(type) ?? 0) + 1);
  }
  for (const row of rows) {
    if (row.action !== 'CREATE' || !row.values.isDefault) continue;
    const saleType = normalizedPriceListType(row.values.priceListType);
    if (saleType !== 'RETAIL' && saleType !== 'WHOLESALE') continue;
    if (existing.some((item) => item.isActive && item.isDefault && normalizedPriceListType(item.priceListType) === saleType) ||
      (requested.get(saleType) ?? 0) > 1) {
      invalidate(row, `An active default ${saleType} price list already exists or is in this upload.`);
    }
  }
}
