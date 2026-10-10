import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EntityManager, DataSource } from 'typeorm';
import { TenantPrincipal } from '../auth/auth.types';
import { ProductService } from '../products/products.service';
import { ProductSupplierUnitsService } from '../product-supplier-units/product-supplier-units.service';
import { PriceListItemDiscountService, validatePriceItemDiscount } from '../price-list-item-discounts/price-list-item-discounts.service';
import { PublishPriceListItemDiscountDto } from '../price-list-item-discounts/dto/price-list-item-discount.dto';
import { Category } from '../categories/categories.entity';
import { Brand } from '../brands/brands.entity';
import { UnitOfMeasure } from '../units/units.entity';
import { Supplier } from '../suppliers/suppliers.entity';
import { PriceList } from '../price-lists/price-lists.entity';
import { Location } from '../locations/locations.entity';
import { IdentifierType } from '../identifier-types/identifier-types.entity';
import { Attribute } from '../attributes/attributes.entity';
import { Product } from '../products/products.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { ProductIdentifier } from '../product-identifiers/product-identifiers.entity';
import { ProductSupplier } from '../product-suppliers/product-suppliers.entity';
import { ProductSupplierUnit } from '../product-supplier-units/product-supplier-unit.entity';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { ProductAttributes } from '../product-attributes/product-attributes.entity';
import { PriceListItem } from '../price-list-items/price-list-items.entity';
import { PriceListItemDiscount, PriceListItemDiscountType } from '../price-list-item-discounts/price-list-item-discounts.entity';
import { ProductSupplierPrice } from '../product-supplier-prices/product-supplier-price.entity';
import { CreateProductDto, CreateProductSupplierLinkInputDto } from '../products/dto/create-products.dto';
import { normalizeProductIdentifier } from '../product-identifiers/product-identifier-normalization';
import { businessDateAt, businessDayEnd, businessDayStart, isEffectiveOnBusinessDate, tenantBusinessClock } from '../../common/business-date';
import { ProductImportBatch } from './product-import-batch.entity';
import { ProductImportRef } from './product-import-ref.entity';
import { ProductRawRow, ProductResultRow, parseProductImport, productImportTemplate, productResultsWorkbook, productValidationWorkbook } from './product-import.excel';
import { ProductImportType, ProductImportSheet } from './product-import.schema';
import { codeKey, currency, nonnegativeInteger, operation, optionalBoolean, optionalDate, positiveNumber } from './product-import.values';

type Refs = { categories: Category[]; brands: Brand[]; units: UnitOfMeasure[]; suppliers: Supplier[];
  lists: PriceList[]; locations: Location[]; identifiers: IdentifierType[]; attributes: Attribute[] };
type IdentifierPlanState = { original: ProductIdentifier[]; rows: ProductIdentifier[]; touched: Set<number> };
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const code = (row: ProductRawRow, field: string) => codeKey(row.values[field]);
const asNumber = (value: unknown) => Number(value);
const iso = (value: Date | string | null | undefined) => value ? new Date(value).toISOString() : '';
const keyFor = (row: ProductRawRow) => code(row, 'ProductImportKey');

@Injectable()
export class ProductImportService {
  constructor(private readonly dataSource: DataSource, private readonly products: ProductService,
    private readonly supplierUnits: ProductSupplierUnitsService, private readonly discounts: PriceListItemDiscountService) {}

  template(type: ProductImportType, sample: boolean) { return productImportTemplate(type, sample); }

  async preview(type: ProductImportType, datasetId: string, buffer: Buffer, user: TenantPrincipal) {
    const dataset = this.dataset(type, datasetId);
    const raw = await parseProductImport(buffer, type);
    const fileHash = digest(buffer.toString('base64'));
    const repo = this.dataSource.getRepository(ProductImportBatch);
    let batch = await repo.findOneBy({ tenantId: user.tenantId, importType: type, datasetId: dataset, fileHash });
    if (!batch) {
      try { batch = await repo.save(repo.create({ tenantId: user.tenantId, importType: type, datasetId: dataset,
        fileHash, status: 'PREVIEW', rowsJson: JSON.stringify(raw), previewJson: null, resultsJson: null, completedAt: null })); }
      catch (error) {
        if ((error as { code?: string }).code !== 'ER_DUP_ENTRY') throw error;
        batch = await repo.findOneByOrFail({ tenantId: user.tenantId, importType: type, datasetId: dataset, fileHash });
      }
    }
    return this.describe(batch, user, true);
  }

  async get(type: ProductImportType, batchId: number, user: TenantPrincipal) {
    return this.describe(await this.batch(this.dataSource.manager, type, batchId, user.tenantId), user);
  }

  async history(type: ProductImportType, user: TenantPrincipal, page = 1, limit = 20) {
    if (!Number.isSafeInteger(page) || page < 1 || ![20, 50, 100].includes(limit))
      throw new BadRequestException('History page must be positive and page size must be 20, 50 or 100.');
    const [rows, totalCount] = await this.dataSource.getRepository(ProductImportBatch).findAndCount({
      where: { tenantId: user.tenantId, importType: type }, order: { createdAt: 'DESC', batchId: 'DESC' },
      skip: (page - 1) * limit, take: limit,
    });
    return { items: rows.map((row) => ({ batchId: Number(row.batchId), datasetId: row.datasetId,
      status: row.status, createdAt: row.createdAt, completedAt: row.completedAt })), page, limit, totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)) };
  }

  async results(type: ProductImportType, batchId: number, user: TenantPrincipal) {
    const batch = await this.batch(this.dataSource.manager, type, batchId, user.tenantId);
    if (batch.status !== 'COMPLETED' || !batch.resultsJson) throw new BadRequestException('Confirm the import before downloading results.');
    return productResultsWorkbook(JSON.parse(batch.resultsJson));
  }

  async validationReport(type: ProductImportType, batchId: number, user: TenantPrincipal) {
    const batch = await this.batch(this.dataSource.manager, type, batchId, user.tenantId);
    if (!batch.previewJson) throw new BadRequestException('Preview this workbook before downloading its validation report.');
    return productValidationWorkbook(JSON.parse(batch.previewJson));
  }

  async confirm(type: ProductImportType, batchId: number, user: TenantPrincipal) {
    return this.dataSource.transaction(async (manager) => {
      const batch = await manager.getRepository(ProductImportBatch).findOne({ where: { batchId, tenantId: user.tenantId, importType: type }, lock: { mode: 'pessimistic_write' } });
      if (!batch) throw new NotFoundException('Import batch not found.');
      if (batch.status === 'COMPLETED') return this.format(batch, JSON.parse(batch.resultsJson!));
      // Tenant row lock serializes competing product imports and SKU assignment.
      await manager.query('SELECT tenant_id FROM tbl_tenant WHERE tenant_id = ? FOR UPDATE', [user.tenantId]);
      const raw = JSON.parse(batch.rowsJson) as ProductRawRow[];
      const planned = await this.validate(raw, batch, user, manager);
      if (!batch.previewJson || digest(planned) !== digest(JSON.parse(batch.previewJson)))
        throw new ConflictException('The database changed after preview. Validate and preview again before confirming.');
      if (planned.some((row) => row.status === 'ERROR')) throw new BadRequestException('Correct validation errors and preview a new workbook before confirming.');
      const results = type === 'onboarding'
        ? await this.confirmOnboarding(raw, planned, batch, user, manager)
        : await this.confirmIndividual(planned, batch, user, manager);
      batch.resultsJson = JSON.stringify(results);
      batch.status = 'COMPLETED';
      batch.completedAt = new Date();
      await manager.getRepository(ProductImportBatch).save(batch);
      return this.format(batch, results);
    });
  }

  private dataset(type: ProductImportType, input: string) {
    const value = input.trim();
    if (['onboarding', 'products'].includes(type) && (!value || value.length > 100 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)))
      throw new BadRequestException('A stable Dataset ID with letters, numbers, dots, underscores or hyphens is required for product creation or maintenance.');
    return ['onboarding', 'products'].includes(type) ? value : '_MAINTENANCE';
  }

  private async batch(manager: EntityManager, type: ProductImportType, batchId: number, tenantId: number) {
    const batch = await manager.getRepository(ProductImportBatch).findOneBy({ batchId, tenantId, importType: type });
    if (!batch) throw new NotFoundException('Import batch not found.');
    return batch;
  }

  private async describe(batch: ProductImportBatch, user: TenantPrincipal, refresh = false) {
    if (batch.status === 'COMPLETED') return this.format(batch, JSON.parse(batch.resultsJson!));
    const rows = await this.validate(JSON.parse(batch.rowsJson), batch, user, this.dataSource.manager);
    if (refresh || !batch.previewJson) {
      batch.previewJson = JSON.stringify(rows);
      await this.dataSource.getRepository(ProductImportBatch).update({ batchId: batch.batchId, tenantId: user.tenantId, status: 'PREVIEW' }, { previewJson: batch.previewJson });
    }
    const approved = JSON.parse(batch.previewJson) as ProductResultRow[];
    if (digest(rows) !== digest(approved)) throw new ConflictException('This preview is stale. Upload the workbook and validate again.');
    return this.format(batch, approved);
  }

  private format(batch: ProductImportBatch, rows: ProductResultRow[]) {
    const counts = { create: rows.filter((row) => row.action === 'CREATE').length,
      update: rows.filter((row) => row.action === 'UPDATE').length, revise: rows.filter((row) => row.action === 'REVISE').length,
      end: rows.filter((row) => row.action === 'END').length, skip: rows.filter((row) => row.action === 'SKIP').length,
      error: rows.filter((row) => row.action === 'ERROR').length };
    return { batchId: Number(batch.batchId), importType: batch.importType, datasetId: batch.datasetId,
      status: batch.status, counts, rows };
  }

  private async refs(manager: EntityManager, tenantId: number): Promise<Refs> {
    const [categories, brands, units, suppliers, lists, locations, identifiers, attributes] = await Promise.all([
      manager.getRepository(Category).findBy({ tenantId, isActive: true }), manager.getRepository(Brand).findBy({ tenantId, isActive: true }),
      manager.getRepository(UnitOfMeasure).findBy({ tenantId, isActive: true }), manager.getRepository(Supplier).findBy({ tenantId, isActive: true }),
      manager.getRepository(PriceList).findBy({ tenantId, isActive: true }), manager.getRepository(Location).findBy({ tenantId, isActive: true }),
      manager.getRepository(IdentifierType).findBy({ isActive: true }), manager.getRepository(Attribute).findBy({ tenantId, isActive: true }),
    ]);
    return { categories, brands, units, suppliers, lists, locations, identifiers, attributes };
  }

  private ref<T>(rows: T[], field: keyof T, input: string, label: string): T {
    if (!input) throw new BadRequestException(`${label} is required.`);
    const matches = rows.filter((row) => codeKey(row[field]) === codeKey(input));
    if (matches.length !== 1) throw new BadRequestException(matches.length ? `${label} ${input} is ambiguous.` : `${label} ${input} is unknown or inactive.`);
    return matches[0];
  }

  private async validate(raw: ProductRawRow[], batch: ProductImportBatch, user: TenantPrincipal, manager: EntityManager): Promise<ProductResultRow[]> {
    const refs = await this.refs(manager, user.tenantId);
    const clock = await tenantBusinessClock(manager, user.tenantId);
    const onboarding = batch.importType === 'onboarding';
    const products = onboarding ? new Map(raw.filter((row) => row.sheet === 'products').map((row) => [keyFor(row), row])) : new Map<string, ProductRawRow>();
    const duplicateProductKeys = new Set<string>();
    if (onboarding) {
      const seen = new Set<string>();
      for (const row of raw.filter((item) => item.sheet === 'products')) {
        const key = keyFor(row);
        if (seen.has(key)) duplicateProductKeys.add(key);
        seen.add(key);
      }
    }
    const seenRelationships = new Set<string>();
    const identifierStates = new Map<number, IdentifierPlanState>();
    const output: ProductResultRow[] = [];
    for (const row of raw) {
      const result: ProductResultRow = { ...row, action: 'ERROR', status: 'ERROR', sku: row.values.SKU || '', details: '' };
      try {
        const action = operation(row.values.Operation, onboarding);
        if (onboarding && action !== 'CREATE') throw new BadRequestException('Onboarding only supports CREATE.');
        if (!onboarding && !row.values.SKU && row.sheet !== 'products') throw new BadRequestException('SKU is required for maintenance.');
        if (onboarding) {
          const key = keyFor(row);
          if (!key || !/^[A-Z0-9][A-Z0-9._-]{0,99}$/.test(key)) throw new BadRequestException('ProductImportKey is required and must use letters, numbers, dots, underscores or hyphens.');
          if (row.values.SKU) throw new BadRequestException('Do not enter an ERP SKU on onboarding sheets.');
          if (duplicateProductKeys.has(key)) throw new BadRequestException(`ProductImportKey ${key} occurs on multiple product rows.`);
          if (!products.has(key)) throw new BadRequestException(`ProductImportKey ${key} has no row on 01 Products.`);
        }
        const identity = onboarding || row.sheet === 'products' && action === 'CREATE' ? keyFor(row) : code(row, 'SKU');
        if (!onboarding && row.sheet === 'products' && action === 'CREATE') {
          if (!identity || !/^[A-Z0-9][A-Z0-9._-]{0,99}$/.test(identity)) throw new BadRequestException('ProductImportKey is required for Product Master CREATE.');
        }
        const relationship = [row.sheet, identity, code(row, 'PriceListCode'), code(row, 'SupplierCode'), code(row, 'UnitCode'), code(row, 'LocationCode'), code(row, 'AttributeCode'), code(row, 'IdentifierValue'), code(row, 'CurrencyCode'), row.values.MinimumQuantity || '1', row.values.EffectiveFrom || ''].join(':');
        if (seenRelationships.has(relationship)) throw new BadRequestException('Duplicate relationship or pricing operation in this workbook.');
        seenRelationships.add(relationship);
        if (action === 'SKIP') { result.action = 'SKIP'; result.status = 'SKIPPED'; result.details = 'Explicitly skipped.'; output.push(result); continue; }
        if (onboarding && ['selling-prices', 'selling-discounts', 'supplier-prices'].includes(row.sheet))
          for (const field of ['EffectiveFrom', 'EffectiveTo', 'PriceEffectiveFrom'])
            if (row.values[field] && !/^\d{4}-\d{2}-\d{2}$/.test(row.values[field]))
              throw new BadRequestException(`${field} must be YYYY-MM-DD during onboarding; the Product Wizard publishes tenant business days.`);
        this.validateFields(row, refs, user);
        if (onboarding) {
          const group = raw.filter((item) => keyFor(item) === identity).map((item) => ({ sheet: item.sheet, values: item.values }));
          const definitionHash = digest(group);
          const mapped = await manager.getRepository(ProductImportRef).findOneBy({ tenantId: user.tenantId, datasetId: batch.datasetId, importKey: identity });
          if (mapped) {
            if (mapped.definitionHash !== definitionHash) throw new ConflictException(`ProductImportKey ${identity} already maps to ${mapped.sku} with different source data in this dataset.`);
            result.action = 'SKIP'; result.status = 'SKIPPED'; result.sku = mapped.sku;
            result.details = `Already imported as ${mapped.sku} in this dataset.`;
          } else {
            result.action = 'CREATE'; result.status = 'READY'; result.details = 'Will create with the Product Wizard rules.';
          }
        } else {
          const sku = row.values.SKU.trim();
          const product = await manager.getRepository(Product).findOneBy({ tenantId: user.tenantId, sku });
          if (!product && !(row.sheet === 'products' && action === 'CREATE')) throw new NotFoundException(`SKU ${sku} does not exist for this tenant.`);
          if (product && row.sheet === 'products' && action === 'CREATE') throw new ConflictException(`SKU ${sku} already exists. Use UPDATE explicitly.`);
          if (row.sheet === 'products' && action === 'CREATE' && sku) throw new BadRequestException('Leave SKU blank for Product Master CREATE; the ERP generates it.');
          if (row.sheet === 'products' && action === 'CREATE' && (optionalBoolean(row.values.IsSellable, 'IsSellable') !== false || optionalBoolean(row.values.IsPurchasable, 'IsPurchasable') !== false || optionalBoolean(row.values.IsStockItem, 'IsStockItem') !== false))
            throw new BadRequestException('Product Master-only CREATE must set IsSellable, IsPurchasable and IsStockItem to FALSE. Add relationships, then explicitly enable the product.');
          if (row.sheet === 'products' && action === 'CREATE') {
            const mapped = await manager.getRepository(ProductImportRef).findOneBy({ tenantId: user.tenantId, datasetId: batch.datasetId, importKey: identity });
            if (mapped) {
              if (mapped.definitionHash !== digest([{ sheet: row.sheet, values: row.values }])) throw new ConflictException(`ProductImportKey ${identity} already maps to ${mapped.sku} with different source data.`);
              result.action = 'SKIP'; result.status = 'SKIPPED'; result.sku = mapped.sku; result.details = `Already created as ${mapped.sku}.`;
              output.push(result); continue;
            }
          }
          if (row.sheet === 'products' && !['CREATE', 'UPDATE'].includes(action)) throw new BadRequestException('Product Master supports CREATE or UPDATE.');
           const impact = product ? await this.planIndividual(row, action, product, refs, manager, user.tenantId, clock.timeZone, identifierStates) : {};
          Object.assign(result, impact);
          result.action = action;
          result.status = 'READY';
          result.details = result.details || `${action} will be applied to ${sku || 'a generated SKU'}.`;
        }
      } catch (error) {
        result.action = 'ERROR'; result.status = 'ERROR';
        result.details = error instanceof Error ? error.message : 'Invalid import row.';
      }
      output.push(result);
    }
    if (onboarding) {
      this.validateOnboardingCompleteness(raw, output, refs, clock.businessDate, clock.timeZone);
      for (const product of raw.filter((row) => row.sheet === 'products')) {
        const group = output.filter((row) => keyFor(row) === keyFor(product));
        if (!group.some((row) => row.status === 'ERROR')) continue;
        for (const row of group) if (row.status === 'READY') {
          row.action = 'ERROR'; row.status = 'ERROR';
          row.details = `ProductImportKey ${keyFor(product)} has a validation error in its onboarding group.`;
        }
      }
    }
    return output;
  }

  private validateFields(row: ProductRawRow, refs: Refs, user: TenantPrincipal) {
    const v = row.values;
    if (row.sheet === 'products') {
      if ((v.Operation || 'CREATE').toUpperCase() === 'CREATE') {
        if (!v.ProductName) throw new BadRequestException('ProductName is required.');
        if (!v.CategoryCode) throw new BadRequestException('CategoryCode is required for Product Master CREATE.');
        if (!v.BaseUnitCode) throw new BadRequestException('BaseUnitCode is required for Product Master CREATE.');
      }
      if (v.CategoryCode) this.ref(refs.categories, 'categoryCode', v.CategoryCode, 'CategoryCode');
      if (v.BrandCode) this.ref(refs.brands, 'brandCode', v.BrandCode, 'BrandCode');
      if (v.BaseUnitCode) this.ref(refs.units, 'code', v.BaseUnitCode, 'BaseUnitCode');
      for (const field of ['IsActive', 'IsSellable', 'IsPurchasable', 'IsStockItem', 'TrackBatch', 'TrackExpiry', 'TrackSerial']) optionalBoolean(v[field], field);
    } else if (row.sheet === 'product-units') {
      this.ref(refs.units, 'code', v.UnitCode, 'UnitCode');
      positiveNumber(v.ConversionFactor, 'ConversionFactor', false);
      for (const field of ['IsBaseUnit', 'IsPurchaseUnit', 'IsSalesUnit', 'IsActive']) optionalBoolean(v[field], field);
      if (optionalBoolean(v.IsSalesUnit, 'IsSalesUnit') && optionalBoolean(v.IsBaseUnit, 'IsBaseUnit') === false) throw new BadRequestException('Only the base unit can be a sales unit.');
    } else if (row.sheet === 'identifiers') {
      this.ref(refs.identifiers, 'code', v.IdentifierTypeCode, 'IdentifierTypeCode');
      if (!v.IdentifierValue) throw new BadRequestException('IdentifierValue is required.');
      if (v.UnitCode) this.ref(refs.units, 'code', v.UnitCode, 'UnitCode');
      optionalBoolean(v.IsPrimary, 'IsPrimary'); optionalBoolean(v.IsActive, 'IsActive');
    } else if (row.sheet === 'selling-prices' || row.sheet === 'selling-discounts') {
      this.ref(refs.lists, 'code', v.PriceListCode, 'PriceListCode');
      this.ref(refs.units, 'code', v.UnitCode, 'UnitCode');
      currency(v.CurrencyCode, this.ref(refs.lists, 'code', v.PriceListCode, 'PriceListCode').currencyCode);
      positiveNumber(v.MinimumQuantity, 'MinimumQuantity', false);
      optionalDate(v.EffectiveFrom, 'EffectiveFrom'); optionalDate(v.EffectiveTo, 'EffectiveTo');
      if (v.PriceEffectiveFrom) optionalDate(v.PriceEffectiveFrom, 'PriceEffectiveFrom');
      if (row.sheet === 'selling-prices') {
        if (['CREATE', 'REVISE'].includes(code(row, 'Operation'))) positiveNumber(v.SellingPrice, 'SellingPrice');
        optionalBoolean(v.IsActive, 'IsActive');
        if (optionalBoolean(v.IsActive, 'IsActive') === false && code(row, 'Operation') !== 'END')
          throw new BadRequestException('Maintenance price publishing creates active versions. Use END to close a price.');
      } else {
        if (v.DiscountType && !Object.values(PriceListItemDiscountType).includes(v.DiscountType as PriceListItemDiscountType)) throw new BadRequestException('DiscountType must be PERCENTAGE or FIXED_AMOUNT.');
        if (row.sheet === 'selling-discounts' && (code(row, 'Operation') || 'CREATE') !== 'END') {
          if (!v.DiscountType) throw new BadRequestException('DiscountType is required.');
          positiveNumber(v.DiscountValue, 'DiscountValue');
          if (!v.EffectiveFrom) throw new BadRequestException('EffectiveFrom is required for a discount.');
          const violations = validateSync(plainToInstance(PublishPriceListItemDiscountDto, {
            discountType: v.DiscountType, discountValue: v.DiscountValue,
            effectiveFrom: v.EffectiveFrom, effectiveTo: v.EffectiveTo || undefined,
          }));
          if (violations.length) throw new BadRequestException(`Invalid discount fields: ${violations.map((item) => item.property).join(', ')}.`);
        }
        if (v.DiscountType === 'PERCENTAGE' && Number(v.DiscountValue) > 100) throw new BadRequestException('Percentage discount cannot exceed 100.');
      }
    } else if (row.sheet === 'product-suppliers' || row.sheet === 'supplier-units' || row.sheet === 'supplier-prices') {
      this.ref(refs.suppliers, 'supplierCode', v.SupplierCode, 'SupplierCode');
      if (row.sheet === 'supplier-units' || row.sheet === 'supplier-prices') this.ref(refs.units, 'code', v.UnitCode, 'UnitCode');
      if (row.sheet === 'product-suppliers') {
        optionalBoolean(v.IsPrimarySupplier, 'IsPrimarySupplier'); optionalBoolean(v.IsActive, 'IsActive');
        nonnegativeInteger(v.BaselineLeadTimeDays, 'BaselineLeadTimeDays');
      } else if (row.sheet === 'supplier-units') {
        positiveNumber(v.MinimumOrderQty, 'MinimumOrderQty', false); nonnegativeInteger(v.LeadTimeDays, 'LeadTimeDays');
        optionalBoolean(v.IsDefaultPurchaseUnit, 'IsDefaultPurchaseUnit'); optionalBoolean(v.IsActive, 'IsActive');
      } else {
        if (['CREATE', 'REVISE'].includes(code(row, 'Operation'))) positiveNumber(v.PurchasePrice, 'PurchasePrice');
        currency(v.CurrencyCode); positiveNumber(v.MinimumQuantity, 'MinimumQuantity', false);
        optionalDate(v.EffectiveFrom, 'EffectiveFrom'); optionalDate(v.EffectiveTo, 'EffectiveTo'); optionalBoolean(v.IsActive, 'IsActive');
        if (optionalBoolean(v.IsActive, 'IsActive') === false && code(row, 'Operation') !== 'END')
          throw new BadRequestException('Maintenance purchase-price publishing creates active versions. Use END to close a price.');
      }
    } else if (row.sheet === 'product-locations') {
      const location = this.ref(refs.locations, 'code', v.LocationCode, 'LocationCode');
      if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(Number(location.locationId)))
        throw new ForbiddenException('User is not assigned to this location.');
      for (const field of ['IsActive', 'IsSellable', 'IsPurchasable']) optionalBoolean(v[field], field);
    } else if (row.sheet === 'product-attributes') {
      this.ref(refs.attributes, 'code', v.AttributeCode, 'AttributeCode');
      if (!v.Value || v.Value.length > 500) throw new BadRequestException('Attribute Value is required and must be at most 500 characters.');
    }
  }

  private validateOnboardingCompleteness(raw: ProductRawRow[], planned: ProductResultRow[], refs: Refs, businessDate: string, timeZone: string) {
    for (const product of raw.filter((row) => row.sheet === 'products')) {
      const group = raw.filter((row) => keyFor(row) === keyFor(product));
      const result = planned.find((row) => row.sheet === 'products' && row.rowNumber === product.rowNumber)!;
      const errors: string[] = [];
      if (!group.some((row) => row.sheet === 'product-units' && code(row, 'UnitCode') === code(product, 'BaseUnitCode') && code(row, 'IsBaseUnit') === 'TRUE')) errors.push('A matching base Product Unit row is required.');
      if (code(product, 'IsSellable') !== 'FALSE' && !group.some((row) => row.sheet === 'selling-prices' && Number(row.values.MinimumQuantity || 1) === 1)) errors.push('A sellable product needs a base selling price.');
      if (code(product, 'IsPurchasable') !== 'FALSE' && !group.some((row) => row.sheet === 'supplier-prices' && Number(row.values.MinimumQuantity || 1) === 1)) errors.push('A purchasable product needs a supplier purchase price.');
      if (code(product, 'IsStockItem') !== 'FALSE' && !group.some((row) => row.sheet === 'product-locations')) errors.push('A stock product needs a location.');
      const identifiers = group.filter((row) => row.sheet === 'identifiers');
      if (identifiers.filter((row) => code(row, 'IsPrimary') === 'TRUE' && code(row, 'IsActive') !== 'FALSE').length > 1)
        errors.push('Only one primary identifier is allowed per product.');
      const identifierValues = identifiers.map((row) => normalizeProductIdentifier(row.values.IdentifierValue));
      if (new Set(identifierValues).size !== identifierValues.length) errors.push('Duplicate product identifier.');
      if (!errors.length && result.status !== 'SKIPPED') {
        try {
          const dto = this.onboardingDto(group, refs);
          const violations = validateSync(plainToInstance(CreateProductDto, dto), { whitelist: true });
          if (violations.length) errors.push('Product Wizard DTO validation failed: ' + violations.map((item) => item.property).join(', '));
          if (dto.isSellable !== false && !dto.prices?.some((price) => Number(price.minimumQuantity ?? 1) <= 1 && Number(price.unitId) === Number(dto.baseUnitId) && Number(price.sellingPrice) > 0 && isEffectiveOnBusinessDate(price, businessDate, timeZone)))
            errors.push('A sellable product needs a current active base selling price for quantity one.');
          if (dto.isPurchasable !== false && !dto.supplierLinks?.some((link) => link.isActive !== false && link.units.some((unit) => unit.isActive !== false && unit.prices.some((price) => Number(price.purchasePrice) > 0 && isEffectiveOnBusinessDate(price, businessDate, timeZone)))))
            errors.push('A purchasable product needs a current active supplier price.');
        } catch (error) { errors.push(error instanceof Error ? error.message : 'Invalid product aggregate.'); }
      }
      if (errors.length) { result.action = 'ERROR'; result.status = 'ERROR'; result.details = errors.join(' '); }
    }
  }

  private async planIndividual(row: ProductRawRow, action: string, product: Product, refs: Refs, manager: EntityManager, tenantId: number, timeZone = 'UTC', identifierStates?: Map<number, IdentifierPlanState>): Promise<Partial<ProductResultRow>> {
    const v = row.values;
    if (row.sheet === 'products') {
      if (action !== 'UPDATE') throw new BadRequestException('Existing Product Master supports only UPDATE.');
      if (v.BaseUnitCode && asNumber(this.ref(refs.units, 'code', v.BaseUnitCode, 'BaseUnitCode').unitId) !== asNumber(product.baseUnitId))
        throw new BadRequestException('Base unit cannot be changed after product creation.');
      return { recordId: Number(product.productId), oldValue: product.productName, newValue: v.ProductName || product.productName,
        stateHash: digest(product), details: 'Only supplied descriptive and flag fields will change.' };
    }
    if (['REVISE', 'END'].includes(action) && !['selling-prices', 'selling-discounts', 'supplier-prices'].includes(row.sheet))
      throw new BadRequestException('REVISE and END are supported only for versioned price or discount records.');
    if (row.sheet === 'product-units') {
      const unit = this.ref(refs.units, 'code', v.UnitCode, 'UnitCode');
      const existing = await manager.getRepository(ProductUnit).findOneBy({ productId: product.productId, unitId: unit.unitId });
      this.assertRelationshipAction(action, existing, 'Product Unit');
      if (optionalBoolean(v.IsSalesUnit, 'IsSalesUnit') && !(optionalBoolean(v.IsBaseUnit, 'IsBaseUnit') ?? existing?.isBaseUnit))
        throw new BadRequestException('Only the base unit can be a sales unit.');
      if (!existing && !v.ConversionFactor) throw new BadRequestException('ConversionFactor is required for CREATE.');
      if (existing && v.ConversionFactor && Number(existing.conversionFactor) !== Number(v.ConversionFactor))
        throw new BadRequestException('Bulk maintenance cannot change an established conversion factor. Create a separate Product Unit where supported.');
      return { recordId: existing ? Number(existing.productUnitId) : undefined, oldValue: existing?.conversionFactor,
        newValue: v.ConversionFactor || existing?.conversionFactor, stateHash: digest(existing) };
    }
    if (row.sheet === 'identifiers') {
      return this.planIdentifier(row, action, product, refs, manager, tenantId, identifierStates);
    }
    if (row.sheet === 'product-suppliers') {
      const supplier = this.ref(refs.suppliers, 'supplierCode', v.SupplierCode, 'SupplierCode');
      const existing = await manager.getRepository(ProductSupplier).findOneBy({ productId: product.productId, supplierId: supplier.supplierId });
      this.assertRelationshipAction(action, existing, 'Product Supplier');
      return { recordId: existing ? Number(existing.productSupplierId) : undefined, stateHash: digest(existing) };
    }
    if (row.sheet === 'supplier-units') {
      const { link, unit } = await this.supplierUnitContext(row, product, refs, manager);
      const existing = await manager.getRepository(ProductSupplierUnit).findOneBy({ productSupplierId: link.productSupplierId, productUnitId: unit.productUnitId });
      this.assertRelationshipAction(action, existing, 'Supplier Purchase Unit');
      return { recordId: existing ? Number(existing.productSupplierUnitId) : undefined, parentId: Number(link.productSupplierId), stateHash: digest(existing) };
    }
    if (row.sheet === 'product-locations') {
      const location = this.ref(refs.locations, 'code', v.LocationCode, 'LocationCode');
      const existing = await manager.getRepository(ProductLocation).findOneBy({ productId: product.productId, locationId: location.locationId });
      this.assertRelationshipAction(action, existing, 'Product Location');
      return { recordId: existing ? Number(existing.productLocationId) : undefined, stateHash: digest(existing) };
    }
    if (row.sheet === 'product-attributes') {
      const attribute = this.ref(refs.attributes, 'code', v.AttributeCode, 'AttributeCode');
      const existing = await manager.getRepository(ProductAttributes).findOneBy({ productId: product.productId, attributeId: attribute.attributeId });
      this.assertRelationshipAction(action, existing, 'Product Attribute');
      return { recordId: existing ? Number(existing.productAttributeId) : undefined, oldValue: existing?.value,
        newValue: v.Value, stateHash: digest(existing) };
    }
    if (row.sheet === 'selling-prices') return this.planSellingPrice(row, action, product, refs, manager, tenantId, timeZone);
    if (row.sheet === 'supplier-prices') return this.planSupplierPrice(row, action, product, refs, manager, timeZone);
    if (row.sheet === 'selling-discounts') return this.planDiscount(row, action, product, refs, manager, tenantId, timeZone);
    throw new BadRequestException('Unsupported import sheet.');
  }

  private async planIdentifier(row: ProductRawRow, action: string, product: Product, refs: Refs,
    manager: EntityManager, tenantId: number, states?: Map<number, IdentifierPlanState>): Promise<Partial<ProductResultRow>> {
    const productId = Number(product.productId);
    const repo = manager.getRepository(ProductIdentifier);
    let state = states?.get(productId);
    if (!state) {
      const original = await repo.findBy({ tenantId, productId });
      state = { original, rows: original.map((item) => ({ ...item })), touched: new Set<number>() };
      states?.set(productId, state);
    }
    const v = row.values;
    if (action === 'CREATE' && v.ExistingIdentifierValue)
      throw new BadRequestException('ExistingIdentifierValue is only used for UPDATE.');
    const proposedValue = normalizeProductIdentifier(v.IdentifierValue);
    const targetValue = normalizeProductIdentifier(action === 'UPDATE' && v.ExistingIdentifierValue ? v.ExistingIdentifierValue : v.IdentifierValue);
    const matches = state.rows.filter((item) => normalizeProductIdentifier(item.identifierValue) === targetValue);
    if (matches.length > 1) throw new ConflictException('Identifier target is ambiguous for this product.');
    const target = matches[0];
    this.assertRelationshipAction(action, target, 'Identifier');
    if (target && (Number(target.productIdentifierId) < 1 || state.touched.has(Number(target.productIdentifierId))))
      throw new ConflictException('Multiple rows target the same Product Identifier in this workbook.');
    if (!proposedValue || proposedValue.length > 100)
      throw new BadRequestException('IdentifierValue must contain 1 to 100 characters.');
    if (v.ExistingIdentifierValue && normalizeProductIdentifier(v.ExistingIdentifierValue).length > 100)
      throw new BadRequestException('ExistingIdentifierValue must contain at most 100 characters.');
    const localConflict = state.rows.find((item) => item !== target && normalizeProductIdentifier(item.identifierValue) === proposedValue);
    if (localConflict) throw new ConflictException('Duplicate product identifier.');
    const databaseConflict = await repo.findOneBy({ tenantId, normalizedIdentifierValue: proposedValue });
    if (databaseConflict && Number(databaseConflict.productIdentifierId) !== Number(target?.productIdentifierId))
      throw new ConflictException(Number(databaseConflict.productId) === productId
        ? 'Duplicate product identifier.' : 'Identifier already belongs to another product in this tenant.');
    const identifierType = this.ref(refs.identifiers, 'code', v.IdentifierTypeCode, 'IdentifierTypeCode');
    const isPrimary = optionalBoolean(v.IsPrimary, 'IsPrimary') ?? target?.isPrimary ?? false;
    const isActive = optionalBoolean(v.IsActive, 'IsActive') ?? target?.isActive ?? true;
    if (isActive && isPrimary && state.rows.some((item) => item !== target && item.isActive && item.isPrimary))
      throw new ConflictException('Only one primary identifier is allowed per product. Update the existing primary to FALSE first.');
    const suppliedUnit = v.UnitCode ? await this.productUnit(row, product, refs, manager) : null;
    const baseRequired = ['BARCODE', 'EAN', 'UPC', 'GTIN', 'PLU'].includes(identifierType.code.trim().toUpperCase());
    const unitId = suppliedUnit?.productUnitId ?? target?.productUnitId;
    if (baseRequired) {
      const unit = suppliedUnit ?? await manager.getRepository(ProductUnit).findOneBy(unitId
        ? { productUnitId: unitId, productId, isActive: true } : { productId, isBaseUnit: true, isActive: true });
      if (!unit || !unit.isBaseUnit || !unit.isSalesUnit)
        throw new BadRequestException(`${identifierType.code} identifiers require the active base sales Product Unit.`);
    }
    const recordId = target ? Number(target.productIdentifierId) : undefined;
    if (recordId) state.touched.add(recordId);
    const updated = { ...(target ?? {}), productIdentifierId: recordId ?? -(row.rowNumber + state.rows.length),
      tenantId, productId, identifierTypeId: identifierType.identifierTypeId,
      productUnitId: suppliedUnit?.productUnitId ?? target?.productUnitId ?? null,
      identifierValue: v.IdentifierValue, normalizedIdentifierValue: proposedValue, isPrimary, isActive } as ProductIdentifier;
    if (target) state.rows[state.rows.indexOf(target)] = updated;
    else state.rows.push(updated);
    return { recordId, oldValue: target?.identifierValue, newValue: v.IdentifierValue,
      stateHash: digest(state.original) };
  }

  private assertRelationshipAction(action: string, existing: unknown, label: string) {
    if (!['CREATE', 'UPDATE'].includes(action)) throw new BadRequestException(`${label} supports CREATE or UPDATE.`);
    if (action === 'CREATE' && existing) throw new ConflictException(`${label} already exists. Use UPDATE explicitly.`);
    if (action === 'UPDATE' && !existing) throw new NotFoundException(`${label} does not exist. Use CREATE explicitly.`);
  }

  private async productUnit(row: ProductRawRow, product: Product, refs: Refs, manager: EntityManager) {
    const unit = this.ref(refs.units, 'code', row.values.UnitCode, 'UnitCode');
    const relation = await manager.getRepository(ProductUnit).findOneBy({ productId: product.productId, unitId: unit.unitId, isActive: true });
    if (!relation) throw new NotFoundException('Active Product Unit does not exist for this SKU.');
    return relation;
  }

  private async supplierUnitContext(row: ProductRawRow, product: Product, refs: Refs, manager: EntityManager) {
    const supplier = this.ref(refs.suppliers, 'supplierCode', row.values.SupplierCode, 'SupplierCode');
    const link = await manager.getRepository(ProductSupplier).findOneBy({ productId: product.productId, supplierId: supplier.supplierId, isActive: true });
    if (!link) throw new NotFoundException('Active Product Supplier relationship does not exist.');
    const unit = await this.productUnit(row, product, refs, manager);
    if (!unit.isPurchaseUnit) throw new BadRequestException('Product Unit is not purchase-enabled.');
    return { link, unit };
  }

  private maintenanceDate(value: string, field: string, timeZone: string, end = false): Date | undefined {
    const parsed = optionalDate(value, field);
    if (!parsed || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return parsed;
    return end ? businessDayEnd(value, timeZone) : businessDayStart(value, timeZone);
  }

  private supplierPriceDate(value: string, field: string, timeZone: string, end = false): Date | undefined {
    const date = this.maintenanceDate(value, field, timeZone, end);
    if (!date) return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value) && end)
      return new Date(Math.floor(date.getTime() / 1000) * 1000);
    if (date.getMilliseconds() !== 0)
      throw new BadRequestException(`${field} must have whole-second precision for supplier purchase prices.`);
    return date;
  }

  private schedule(row: ProductRawRow, action: string, timeZone: string) {
    const from = this.maintenanceDate(row.values.EffectiveFrom, 'EffectiveFrom', timeZone);
    const now = new Date();
    if (action !== 'END' && from && from < now)
      throw new BadRequestException('Backdated initial or revised prices are not supported in bulk maintenance.');
    if (action === 'REVISE' && !from) throw new BadRequestException('EffectiveFrom is required for REVISE.');
    const end = this.maintenanceDate(row.values.EffectiveTo, 'EffectiveTo', timeZone, true);
    if (action === 'END' && !end) throw new BadRequestException('EffectiveTo is required for END.');
    if (action === 'END' && from) throw new BadRequestException('Leave EffectiveFrom blank for END; the selected current price will be closed at EffectiveTo.');
    if (action === 'END' && end && end < now) throw new BadRequestException('EffectiveTo cannot be in the past.');
    if (action !== 'END' && end) throw new BadRequestException('CREATE and REVISE publish open-ended maintenance prices. Use a later END operation to close the version.');
    return { from, end, now };
  }

  private async planSellingPrice(row: ProductRawRow, action: string, product: Product, refs: Refs, manager: EntityManager, tenantId: number, timeZone = 'UTC'): Promise<Partial<ProductResultRow>> {
    if (!['CREATE', 'REVISE', 'END'].includes(action)) throw new BadRequestException('Selling Prices support CREATE, REVISE or END.');
    const list = this.ref(refs.lists, 'code', row.values.PriceListCode, 'PriceListCode');
    const unit = await this.productUnit(row, product, refs, manager);
    if (!unit.isBaseUnit || !unit.isSalesUnit || Number(unit.conversionFactor) !== 1) throw new BadRequestException('Selling prices require the active base sales Product Unit.');
    const moneyCode = currency(row.values.CurrencyCode, list.currencyCode);
    const tier = Number(row.values.MinimumQuantity || 1);
    const rows = await manager.getRepository(PriceListItem).findBy({ tenantId, productId: product.productId, priceListId: list.priceListId,
      productUnitId: unit.productUnitId, currencyCode: moneyCode, minimumQuantity: String(tier), isActive: true });
    const { from, end, now } = this.schedule(row, action, timeZone);
    const current = rows.filter((item) => item.effectiveFrom <= now && (!item.effectiveTo || item.effectiveTo >= now));
    if (current.length > 1) throw new ConflictException('Multiple current selling prices match this exact context.');
    if (action === 'CREATE' && rows.some((item) => !item.effectiveTo || item.effectiveTo >= (from ?? now)))
      throw new ConflictException('A current or future selling price exists for this context. Use REVISE.');
    if (action !== 'CREATE' && !current.length) throw new NotFoundException('No current selling price matches this exact context.');
    if (action === 'REVISE' && rows.some((item) => item !== current[0] && item.effectiveFrom > now))
      throw new ConflictException('A future selling price is already scheduled for this context.');
    const target = current[0];
    const oldEnd = action === 'REVISE' && from ? iso(new Date(from.getTime() - 1)) : action === 'END' ? iso(end) : iso(target?.effectiveTo);
    const attached = target ? await manager.getRepository(PriceListItemDiscount).findBy({ tenantId, priceListItemId: target.priceListItemId, isActive: true }) : [];
    return { recordId: target ? Number(target.priceListItemId) : undefined, parentId: Number(unit.productUnitId),
      oldValue: target?.sellingPrice, newValue: row.values.SellingPrice, oldEnd, newStart: from ? iso(from) : 'NOW',
      stateHash: digest({ rows, attached }), details: attached.length && action !== 'CREATE'
        ? `${attached.length} attached discount(s) will be ended; no discount is carried forward.` : 'Exact Price List, unit, currency and tier context.' };
  }

  private async planSupplierPrice(row: ProductRawRow, action: string, product: Product, refs: Refs, manager: EntityManager, timeZone = 'UTC'): Promise<Partial<ProductResultRow>> {
    if (!['CREATE', 'REVISE', 'END'].includes(action)) throw new BadRequestException('Supplier Prices support CREATE, REVISE or END.');
    const { link, unit } = await this.supplierUnitContext(row, product, refs, manager);
    const relation = await manager.getRepository(ProductSupplierUnit).findOneBy({ productSupplierId: link.productSupplierId, productUnitId: unit.productUnitId, isActive: true });
    if (!relation) throw new NotFoundException('Active Supplier Purchase Unit does not exist.');
    const moneyCode = currency(row.values.CurrencyCode);
    const tier = Number(row.values.MinimumQuantity || 1);
    const rows = await manager.getRepository(ProductSupplierPrice).findBy({ productSupplierUnitId: relation.productSupplierUnitId,
      currencyCode: moneyCode, minimumQuantity: String(tier), isActive: true });
    const { now } = this.schedule(row, action, timeZone);
    const from = this.supplierPriceDate(row.values.EffectiveFrom, 'EffectiveFrom', timeZone);
    const end = this.supplierPriceDate(row.values.EffectiveTo, 'EffectiveTo', timeZone, true);
    if (action === 'END' && end && end < now) throw new BadRequestException('EffectiveTo cannot be in the past.');
    const current = rows.filter((item) => item.effectiveFrom <= now && (!item.effectiveTo || item.effectiveTo >= now));
    if (current.length > 1) throw new ConflictException('Multiple current supplier prices match this exact context.');
    if (action === 'CREATE' && rows.some((item) => !item.effectiveTo || item.effectiveTo >= (from ?? now)))
      throw new ConflictException('A current or future supplier price exists for this context. Use REVISE.');
    if (action !== 'CREATE' && !current.length) throw new NotFoundException('No current supplier price matches this exact context.');
    if (action === 'REVISE' && rows.some((item) => item !== current[0] && item.effectiveFrom > now))
      throw new ConflictException('A future supplier price is already scheduled for this context.');
    const target = current[0];
    return { recordId: target ? Number(target.productSupplierPriceId) : undefined, parentId: Number(relation.productSupplierUnitId),
      oldValue: target?.purchasePrice, newValue: row.values.PurchasePrice,
      oldEnd: action === 'REVISE' && from ? iso(new Date(from.getTime() - 1000)) : action === 'END' ? iso(end) : iso(target?.effectiveTo),
      newStart: from ? iso(from) : 'NOW', stateHash: digest(rows), details: 'Exact supplier, purchase unit, currency and tier context.' };
  }

  private async planDiscount(row: ProductRawRow, action: string, product: Product, refs: Refs, manager: EntityManager, tenantId: number, timeZone = 'UTC'): Promise<Partial<ProductResultRow>> {
    if (!['CREATE', 'REVISE', 'END'].includes(action)) throw new BadRequestException('Selling Discounts support CREATE, REVISE or END.');
    const now = new Date();
    const boundary = this.maintenanceDate(action === 'END' ? row.values.EffectiveTo : row.values.EffectiveFrom,
      action === 'END' ? 'EffectiveTo' : 'EffectiveFrom', timeZone, action === 'END');
    if (action === 'END' && row.values.EffectiveFrom) throw new BadRequestException('Leave EffectiveFrom blank for discount END.');
    if (boundary && boundary < now) throw new BadRequestException('Backdated discount maintenance is not supported.');
    const list = this.ref(refs.lists, 'code', row.values.PriceListCode, 'PriceListCode');
    const unit = await this.productUnit(row, product, refs, manager);
    const moneyCode = currency(row.values.CurrencyCode, list.currencyCode);
    const tier = Number(row.values.MinimumQuantity || 1);
    const at = boundary ?? new Date();
    const prices = await manager.getRepository(PriceListItem).findBy({ tenantId, productId: product.productId,
      priceListId: list.priceListId, productUnitId: unit.productUnitId, currencyCode: moneyCode,
      minimumQuantity: String(tier), isActive: true });
    const matching = prices.filter((price) => (!row.values.PriceEffectiveFrom ||
      (/^\d{4}-\d{2}-\d{2}$/.test(row.values.PriceEffectiveFrom)
        ? businessDateAt(price.effectiveFrom, timeZone) === row.values.PriceEffectiveFrom
        : price.effectiveFrom.getTime() === this.maintenanceDate(row.values.PriceEffectiveFrom, 'PriceEffectiveFrom', timeZone)!.getTime()))
      && price.effectiveFrom <= at && (!price.effectiveTo || price.effectiveTo >= at));
    if (matching.length !== 1) throw new BadRequestException(matching.length ? 'Ambiguous selling-price version; supply PriceEffectiveFrom.' : 'No active selling-price version covers the discount date.');
    const price = matching[0];
    const discountEnd = this.maintenanceDate(row.values.EffectiveTo, 'EffectiveTo', timeZone, true);
    if (action !== 'END') {
      if (!boundary) throw new BadRequestException('EffectiveFrom is required for a discount.');
      validatePriceItemDiscount(price, {
        discountType: row.values.DiscountType as PriceListItemDiscountType,
        discountValue: row.values.DiscountValue,
        effectiveFrom: boundary.toISOString(), effectiveTo: discountEnd?.toISOString(),
      });
    }
    const discounts = await manager.getRepository(PriceListItemDiscount).findBy({ tenantId, priceListItemId: price.priceListItemId, isActive: true });
    const current = discounts.filter((discount) => discount.effectiveFrom <= at && (!discount.effectiveTo || discount.effectiveTo >= at));
    if (current.length > 1) throw new ConflictException('Multiple discounts match this price version and date.');
    if (action === 'CREATE' && current.length) throw new ConflictException('A discount already exists for this price and date. Use REVISE.');
    if (action !== 'CREATE' && !current.length) throw new NotFoundException('No applicable discount exists to revise or end.');
    if (action === 'END' && !row.values.EffectiveTo) throw new BadRequestException('EffectiveTo is required for END.');
    if (action === 'REVISE' && !row.values.EffectiveFrom) throw new BadRequestException('EffectiveFrom is required for REVISE.');
    if (action === 'REVISE' && current[0] && boundary && boundary <= current[0].effectiveFrom)
      throw new BadRequestException('Replacement discount must start after the current discount.');
    if (action !== 'END' && boundary && discounts.some((discount) => discount !== current[0] &&
      discount.effectiveFrom <= (discountEnd ?? new Date(8640000000000000)) &&
      (!discount.effectiveTo || discount.effectiveTo >= boundary)))
      throw new ConflictException('Discount validity overlaps another active or scheduled discount.');
    return { recordId: current[0] ? Number(current[0].priceListItemDiscountId) : undefined, parentId: Number(price.priceListItemId),
      oldValue: current[0] ? `${current[0].discountType} ${current[0].discountValue}` : '',
      newValue: row.values.DiscountType && row.values.DiscountValue ? `${row.values.DiscountType} ${row.values.DiscountValue}` : '',
      oldEnd: action === 'REVISE' ? iso(new Date(at.getTime() - 1)) : iso(boundary),
      newStart: action === 'END' ? '' : iso(boundary), stateHash: digest({ price, discounts }),
      details: `Discount belongs to selling-price version ${price.priceListItemId}; base price ${price.sellingPrice}.` };
  }

  private onboardingDto(group: ProductRawRow[], refs: Refs): CreateProductDto {
    const header = group.find((row) => row.sheet === 'products');
    if (!header) throw new BadRequestException('Product row is missing.');
    const v = header.values;
    const category = this.ref(refs.categories, 'categoryCode', v.CategoryCode, 'CategoryCode');
    const brand = v.BrandCode ? this.ref(refs.brands, 'brandCode', v.BrandCode, 'BrandCode') : null;
    const baseUnit = this.ref(refs.units, 'code', v.BaseUnitCode, 'BaseUnitCode');
    const of = (sheet: ProductImportSheet) => group.filter((row) => row.sheet === sheet);
    const productUnits = of('product-units').map((row) => ({ unitId: Number(this.ref(refs.units, 'code', row.values.UnitCode, 'UnitCode').unitId),
      conversionFactor: positiveNumber(row.values.ConversionFactor, 'ConversionFactor')!,
      isBaseUnit: optionalBoolean(row.values.IsBaseUnit, 'IsBaseUnit') ?? false,
      isPurchaseUnit: optionalBoolean(row.values.IsPurchaseUnit, 'IsPurchaseUnit') ?? false,
      isSalesUnit: optionalBoolean(row.values.IsSalesUnit, 'IsSalesUnit') ?? false,
      isActive: optionalBoolean(row.values.IsActive, 'IsActive') ?? true }));
    const prices = of('selling-prices').sort((a, b) => a.values.EffectiveFrom.localeCompare(b.values.EffectiveFrom)).map((row) => {
      const list = this.ref(refs.lists, 'code', row.values.PriceListCode, 'PriceListCode');
      const unit = this.ref(refs.units, 'code', row.values.UnitCode, 'UnitCode');
      if (!row.values.EffectiveFrom) throw new BadRequestException('EffectiveFrom is required for an initial selling price.');
      const priceCurrency = currency(row.values.CurrencyCode, list.currencyCode);
      const tier = Number(row.values.MinimumQuantity || 1);
      const discounts = of('selling-discounts').filter((discount) => code(discount, 'PriceListCode') === code(row, 'PriceListCode')
        && code(discount, 'UnitCode') === code(row, 'UnitCode') && currency(discount.values.CurrencyCode, list.currencyCode) === priceCurrency
        && Number(discount.values.MinimumQuantity || 1) === tier
        && (!discount.values.PriceEffectiveFrom || discount.values.PriceEffectiveFrom.slice(0, 10) === row.values.EffectiveFrom.slice(0, 10)));
      if (discounts.length > 1) throw new BadRequestException('Multiple discounts match one initial price version.');
      const discount = discounts[0] ? {
        discountType: discounts[0].values.DiscountType as PriceListItemDiscountType,
        discountValue: discounts[0].values.DiscountValue,
        effectiveFrom: discounts[0].values.EffectiveFrom,
        ...(discounts[0].values.EffectiveTo ? { effectiveTo: discounts[0].values.EffectiveTo } : {}),
      } : undefined;
      return { priceListId: Number(list.priceListId), unitId: Number(unit.unitId), sellingPrice: positiveNumber(row.values.SellingPrice, 'SellingPrice')!,
        currencyCode: priceCurrency, minimumQuantity: tier, effectiveFrom: row.values.EffectiveFrom,
        effectiveTo: row.values.EffectiveTo || undefined, isActive: optionalBoolean(row.values.IsActive, 'IsActive') ?? true,
        ...(discount ? { discount } : {}) };
    });
    for (const discount of of('selling-discounts')) {
      const candidates = prices.filter((price) => price.priceListId === Number(this.ref(refs.lists, 'code', discount.values.PriceListCode, 'PriceListCode').priceListId)
        && price.unitId === Number(this.ref(refs.units, 'code', discount.values.UnitCode, 'UnitCode').unitId)
        && price.currencyCode === currency(discount.values.CurrencyCode, price.currencyCode)
        && price.minimumQuantity === Number(discount.values.MinimumQuantity || 1)
        && (!discount.values.PriceEffectiveFrom || price.effectiveFrom.slice(0, 10) === discount.values.PriceEffectiveFrom.slice(0, 10)));
      if (candidates.length !== 1) throw new BadRequestException(`Discount row ${discount.rowNumber} needs exactly one matching initial selling-price version.`);
    }
    const supplierLinks: CreateProductSupplierLinkInputDto[] = of('product-suppliers').map((row) => {
      const supplier = this.ref(refs.suppliers, 'supplierCode', row.values.SupplierCode, 'SupplierCode');
      const supplierRows = of('supplier-units').filter((unit) => code(unit, 'SupplierCode') === code(row, 'SupplierCode'));
      const units = supplierRows.map((unitRow) => {
        const supplierPriceRows = of('supplier-prices').filter((price) => code(price, 'SupplierCode') === code(row, 'SupplierCode')
          && code(price, 'UnitCode') === code(unitRow, 'UnitCode'))
          .sort((a, b) => a.values.EffectiveFrom.localeCompare(b.values.EffectiveFrom));
        return { unitId: Number(this.ref(refs.units, 'code', unitRow.values.UnitCode, 'UnitCode').unitId),
          supplierProductCode: unitRow.values.SupplierProductCode || undefined,
          minimumOrderQty: positiveNumber(unitRow.values.MinimumOrderQty, 'MinimumOrderQty', false),
          leadTimeDays: nonnegativeInteger(unitRow.values.LeadTimeDays, 'LeadTimeDays'),
          isDefaultPurchaseUnit: optionalBoolean(unitRow.values.IsDefaultPurchaseUnit, 'IsDefaultPurchaseUnit'),
          isActive: optionalBoolean(unitRow.values.IsActive, 'IsActive') ?? true,
          prices: supplierPriceRows.map((price) => {
            if (!price.values.EffectiveFrom) throw new BadRequestException(`Supplier price row ${price.rowNumber} needs EffectiveFrom.`);
            return { purchasePrice: positiveNumber(price.values.PurchasePrice, 'PurchasePrice')!,
              currencyCode: currency(price.values.CurrencyCode), minimumQuantity: Number(price.values.MinimumQuantity || 1),
              effectiveFrom: price.values.EffectiveFrom, effectiveTo: price.values.EffectiveTo || undefined,
              isActive: optionalBoolean(price.values.IsActive, 'IsActive') ?? true };
          }) };
      });
      return { supplierId: Number(supplier.supplierId), isPrimarySupplier: optionalBoolean(row.values.IsPrimarySupplier, 'IsPrimarySupplier') ?? false,
        isActive: optionalBoolean(row.values.IsActive, 'IsActive') ?? true,
        baselineLeadTimeDays: nonnegativeInteger(row.values.BaselineLeadTimeDays, 'BaselineLeadTimeDays'), units };
    });
    for (const row of of('supplier-units')) if (!of('product-suppliers').some((supplier) => code(supplier, 'SupplierCode') === code(row, 'SupplierCode')))
      throw new BadRequestException(`Supplier Unit row ${row.rowNumber} has no Product Supplier row.`);
    for (const row of of('supplier-prices')) if (!of('supplier-units').some((unit) => code(unit, 'SupplierCode') === code(row, 'SupplierCode') && code(unit, 'UnitCode') === code(row, 'UnitCode')))
      throw new BadRequestException(`Supplier Price row ${row.rowNumber} has no Supplier Purchase Unit row.`);
    return { productName: v.ProductName, description: v.Description || undefined, productType: v.ProductType || 'STOCK',
      categoryId: Number(category.categoryId), brandId: brand ? Number(brand.brandId) : undefined, baseUnitId: Number(baseUnit.unitId),
      isActive: optionalBoolean(v.IsActive, 'IsActive') ?? true, isSellable: optionalBoolean(v.IsSellable, 'IsSellable') ?? true,
      isPurchasable: optionalBoolean(v.IsPurchasable, 'IsPurchasable') ?? true, isStockItem: optionalBoolean(v.IsStockItem, 'IsStockItem') ?? true,
      trackBatch: optionalBoolean(v.TrackBatch, 'TrackBatch') ?? false, trackExpiry: optionalBoolean(v.TrackExpiry, 'TrackExpiry') ?? false,
      trackSerial: optionalBoolean(v.TrackSerial, 'TrackSerial') ?? false,
      productUnits, identifiers: [], prices, supplierLinks,
      locations: of('product-locations').map((row) => ({ locationId: Number(this.ref(refs.locations, 'code', row.values.LocationCode, 'LocationCode').locationId),
        isActive: optionalBoolean(row.values.IsActive, 'IsActive') ?? true,
        isSellable: optionalBoolean(row.values.IsSellable, 'IsSellable') ?? true,
        isPurchasable: optionalBoolean(row.values.IsPurchasable, 'IsPurchasable') ?? true })),
      productAttributes: of('product-attributes').map((row) => ({ attributeId: Number(this.ref(refs.attributes, 'code', row.values.AttributeCode, 'AttributeCode').attributeId), value: row.values.Value })) };
  }

  private async confirmOnboarding(raw: ProductRawRow[], planned: ProductResultRow[], batch: ProductImportBatch, user: TenantPrincipal, manager: EntityManager) {
    const refs = await this.refs(manager, user.tenantId);
    const results = planned.map((row) => ({ ...row }));
    for (const header of raw.filter((row) => row.sheet === 'products')) {
      const key = keyFor(header);
      const group = raw.filter((row) => keyFor(row) === key);
      const groupResults = results.filter((row) => keyFor(row) === key);
      if (groupResults.every((row) => row.status === 'SKIPPED')) continue;
      const dto = this.onboardingDto(group, refs);
      const product = await this.products.createWithManager(dto, user, manager);
      const productId = Number(product.productId);
      const sku = product.sku;
      const identifierRows = group.filter((row) => row.sheet === 'identifiers');
      if (identifierRows.length) {
        const units = await manager.getRepository(ProductUnit).findBy({ productId });
        await this.products.updateIdentifiers(productId, identifierRows.map((row) => {
          const unit = row.values.UnitCode ? this.ref(refs.units, 'code', row.values.UnitCode, 'UnitCode') : null;
          const productUnit = unit ? units.find((item) => Number(item.unitId) === Number(unit.unitId)) : null;
          if (unit && !productUnit) throw new BadRequestException(`Identifier row ${row.rowNumber} uses an unconfigured Product Unit.`);
          return { identifierTypeId: Number(this.ref(refs.identifiers, 'code', row.values.IdentifierTypeCode, 'IdentifierTypeCode').identifierTypeId),
            productUnitId: productUnit ? Number(productUnit.productUnitId) : undefined, identifierValue: row.values.IdentifierValue,
            isPrimary: optionalBoolean(row.values.IsPrimary, 'IsPrimary') ?? false,
            isActive: optionalBoolean(row.values.IsActive, 'IsActive') ?? true };
        }), user.tenantId, manager);
      }
      const definitionHash = digest(group.map((row) => ({ sheet: row.sheet, values: row.values })));
      const repo = manager.getRepository(ProductImportRef);
      await repo.save(repo.create({ tenantId: user.tenantId, datasetId: batch.datasetId, importKey: key,
        productId, sku, definitionHash, batchId: batch.batchId }));
      for (const result of groupResults) { result.sku = sku; result.status = 'COMPLETED'; result.details = result.sheet === 'products' ? `Created product ${sku}.` : `Created for ${sku}.`; }
    }
    return results;
  }

  private async confirmIndividual(planned: ProductResultRow[], batch: ProductImportBatch, user: TenantPrincipal, manager: EntityManager) {
    const refs = await this.refs(manager, user.tenantId);
    const clock = await tenantBusinessClock(manager, user.tenantId);
    const results = planned.map((row) => ({ ...row }));
    for (const result of results) {
      if (result.action === 'SKIP') continue;
      const product = result.values.SKU ? await manager.getRepository(Product).findOneBy({ tenantId: user.tenantId, sku: result.values.SKU }) : null;
      await this.applyIndividual(result, product, refs, manager, user, clock.timeZone);
      if (result.sheet === 'products' && result.action === 'CREATE') {
        const created = await manager.getRepository(Product).findOneByOrFail({ tenantId: user.tenantId, sku: result.sku });
        const repo = manager.getRepository(ProductImportRef);
        await repo.save(repo.create({ tenantId: user.tenantId, datasetId: batch.datasetId, importKey: keyFor(result),
          productId: created.productId, sku: result.sku, definitionHash: digest([{ sheet: result.sheet, values: result.values }]), batchId: batch.batchId }));
      }
      result.status = 'COMPLETED';
      result.details = `${result.action} completed for ${result.sku}.`;
    }
    return results;
  }

  private async applyIndividual(row: ProductResultRow, product: Product | null, refs: Refs, manager: EntityManager, user: TenantPrincipal, timeZone = 'UTC') {
    const v = row.values;
    const id = Number(product?.productId);
    if (row.sheet === 'products') {
      if (row.action === 'CREATE') {
        const base = this.ref(refs.units, 'code', v.BaseUnitCode, 'BaseUnitCode');
        const category = this.ref(refs.categories, 'categoryCode', v.CategoryCode, 'CategoryCode');
        const brand = v.BrandCode ? this.ref(refs.brands, 'brandCode', v.BrandCode, 'BrandCode') : null;
        const created = await this.products.createWithManager({ productName: v.ProductName, description: v.Description || undefined,
          productType: v.ProductType || 'STOCK', categoryId: Number(category.categoryId), brandId: brand ? Number(brand.brandId) : undefined,
          baseUnitId: Number(base.unitId), isSellable: false, isPurchasable: false, isStockItem: false,
          isActive: optionalBoolean(v.IsActive, 'IsActive') ?? true,
          trackBatch: optionalBoolean(v.TrackBatch, 'TrackBatch') ?? false,
          trackExpiry: optionalBoolean(v.TrackExpiry, 'TrackExpiry') ?? false,
          trackSerial: optionalBoolean(v.TrackSerial, 'TrackSerial') ?? false,
          productUnits: [{ unitId: Number(base.unitId), conversionFactor: 1, isBaseUnit: true, isSalesUnit: true,
            isPurchaseUnit: false, isActive: true }], prices: [], supplierLinks: [], locations: [] }, user, manager);
        row.sku = created.sku;
      } else {
        if (!product) throw new NotFoundException('Product disappeared after preview.');
        const updates: Record<string, unknown> = {};
        if (v.ProductName) updates.productName = v.ProductName;
        if (v.Description) updates.description = v.Description;
        if (v.ProductType) updates.productType = v.ProductType;
        if (v.CategoryCode) updates.categoryId = Number(this.ref(refs.categories, 'categoryCode', v.CategoryCode, 'CategoryCode').categoryId);
        if (v.BrandCode) updates.brandId = Number(this.ref(refs.brands, 'brandCode', v.BrandCode, 'BrandCode').brandId);
        const flags: Record<string, string> = { IsActive: 'isActive', IsSellable: 'isSellable', IsPurchasable: 'isPurchasable', IsStockItem: 'isStockItem', TrackBatch: 'trackBatch', TrackExpiry: 'trackExpiry', TrackSerial: 'trackSerial' };
        for (const [field, prop] of Object.entries(flags)) if (v[field]) updates[prop] = optionalBoolean(v[field], field);
        await this.products.updateGeneral(id, updates, user.tenantId, manager);
      }
      return;
    }
    if (!product) throw new NotFoundException('Product disappeared after preview.');
    if (row.sheet === 'product-units') {
      const existing = await manager.getRepository(ProductUnit).findBy({ productId: id });
      const unit = this.ref(refs.units, 'code', v.UnitCode, 'UnitCode');
      const mapped: NonNullable<CreateProductDto['productUnits']> = existing.map((item) => ({ productUnitId: Number(item.productUnitId), unitId: Number(item.unitId),
        conversionFactor: Number(item.conversionFactor), isBaseUnit: item.isBaseUnit, isPurchaseUnit: item.isPurchaseUnit,
        isSalesUnit: item.isSalesUnit, isActive: item.isActive }));
      const index = mapped.findIndex((item) => item.unitId === Number(unit.unitId));
      const old = index >= 0 ? mapped[index] : null;
      const updated = { productUnitId: old?.productUnitId, unitId: Number(unit.unitId),
        conversionFactor: v.ConversionFactor ? Number(v.ConversionFactor) : old?.conversionFactor ?? 1,
        isBaseUnit: optionalBoolean(v.IsBaseUnit, 'IsBaseUnit') ?? old?.isBaseUnit ?? false,
        isPurchaseUnit: optionalBoolean(v.IsPurchaseUnit, 'IsPurchaseUnit') ?? old?.isPurchaseUnit ?? false,
        isSalesUnit: optionalBoolean(v.IsSalesUnit, 'IsSalesUnit') ?? old?.isSalesUnit ?? false,
        isActive: optionalBoolean(v.IsActive, 'IsActive') ?? old?.isActive ?? true };
      if (index < 0) mapped.push(updated); else mapped[index] = updated;
      await this.products.updateUnits(id, mapped, user.tenantId, manager);
      return;
    }
    if (row.sheet === 'identifiers') {
      const existing = await manager.getRepository(ProductIdentifier).findBy({ productId: id, tenantId: user.tenantId });
      const mapped: NonNullable<CreateProductDto['identifiers']> = existing.map((item) => ({ productIdentifierId: Number(item.productIdentifierId), identifierTypeId: Number(item.identifierTypeId),
        productUnitId: item.productUnitId ? Number(item.productUnitId) : undefined, identifierValue: item.identifierValue,
        isPrimary: item.isPrimary, isActive: item.isActive }));
      const index = row.action === 'UPDATE'
        ? mapped.findIndex((item) => item.productIdentifierId === row.recordId)
        : -1;
      if (row.action === 'UPDATE' && index < 0) throw new ConflictException('The selected Product Identifier changed after preview. Validate again.');
      const old = index >= 0 ? mapped[index] : null;
      const unit = v.UnitCode ? await this.productUnit(row, product, refs, manager) : null;
      const updated = { productIdentifierId: old?.productIdentifierId,
        identifierTypeId: Number(this.ref(refs.identifiers, 'code', v.IdentifierTypeCode, 'IdentifierTypeCode').identifierTypeId),
        productUnitId: unit ? Number(unit.productUnitId) : old?.productUnitId,
        identifierValue: v.IdentifierValue, isPrimary: optionalBoolean(v.IsPrimary, 'IsPrimary') ?? old?.isPrimary ?? false,
        isActive: optionalBoolean(v.IsActive, 'IsActive') ?? old?.isActive ?? true };
      if (index < 0) mapped.push(updated); else mapped[index] = updated;
      await this.products.updateIdentifiers(id, mapped, user.tenantId, manager);
      return;
    }
    if (row.sheet === 'product-suppliers') {
      const existing = await manager.getRepository(ProductSupplier).findBy({ productId: id });
      const supplier = this.ref(refs.suppliers, 'supplierCode', v.SupplierCode, 'SupplierCode');
      const mapped: Array<{ productSupplierId?: number; supplierId: number; isPrimarySupplier: boolean; isActive: boolean; baselineLeadTimeDays?: number }> = existing.map((item) => ({ productSupplierId: Number(item.productSupplierId), supplierId: Number(item.supplierId),
        isPrimarySupplier: item.isPrimarySupplier, isActive: item.isActive, baselineLeadTimeDays: item.baselineLeadTimeDays ?? undefined }));
      const index = mapped.findIndex((item) => item.supplierId === Number(supplier.supplierId));
      const old = index >= 0 ? mapped[index] : null;
      const updated = { productSupplierId: old?.productSupplierId, supplierId: Number(supplier.supplierId),
        isPrimarySupplier: optionalBoolean(v.IsPrimarySupplier, 'IsPrimarySupplier') ?? old?.isPrimarySupplier ?? false,
        isActive: optionalBoolean(v.IsActive, 'IsActive') ?? old?.isActive ?? true,
        baselineLeadTimeDays: nonnegativeInteger(v.BaselineLeadTimeDays, 'BaselineLeadTimeDays') ?? old?.baselineLeadTimeDays };
      if (updated.isPrimarySupplier) for (const item of mapped) item.isPrimarySupplier = false;
      if (index < 0) mapped.push(updated); else mapped[index] = updated;
      await this.products.updateSupplierLinks(id, mapped, user.tenantId, manager);
      return;
    }
    if (row.sheet === 'supplier-units') {
      const linkId = row.parentId!;
      const unit = await this.productUnit(row, product, refs, manager);
      const dto = { productSupplierId: linkId, productUnitId: Number(unit.productUnitId),
        supplierProductCode: v.SupplierProductCode || undefined, minimumOrderQty: positiveNumber(v.MinimumOrderQty, 'MinimumOrderQty', false),
        leadTimeDays: nonnegativeInteger(v.LeadTimeDays, 'LeadTimeDays'),
        isDefaultPurchaseUnit: optionalBoolean(v.IsDefaultPurchaseUnit, 'IsDefaultPurchaseUnit') };
      if (row.action === 'CREATE') {
        if (optionalBoolean(v.IsActive, 'IsActive') === false) throw new BadRequestException('Create an active Supplier Purchase Unit, then deactivate explicitly.');
        await this.supplierUnits.create(dto, user.tenantId, manager);
      } else {
        await this.supplierUnits.update(row.recordId!, dto, user.tenantId, manager);
        if (optionalBoolean(v.IsActive, 'IsActive') === false) await this.supplierUnits.deactivate(row.recordId!, user.tenantId, manager);
        if (optionalBoolean(v.IsActive, 'IsActive') === true) await this.supplierUnits.activate(row.recordId!, user.tenantId, manager);
      }
      return;
    }
    if (row.sheet === 'product-locations') {
      const existing = await manager.getRepository(ProductLocation).findBy({ productId: id });
      const location = this.ref(refs.locations, 'code', v.LocationCode, 'LocationCode');
      const mapped: NonNullable<CreateProductDto['locations']> = existing.map((item) => ({ productLocationId: Number(item.productLocationId), locationId: Number(item.locationId),
        isActive: item.isActive, isSellable: item.isSellable, isPurchasable: item.isPurchasable }));
      const index = mapped.findIndex((item) => item.locationId === Number(location.locationId));
      const old = index >= 0 ? mapped[index] : null;
      const updated = { productLocationId: old?.productLocationId, locationId: Number(location.locationId),
        isActive: optionalBoolean(v.IsActive, 'IsActive') ?? old?.isActive ?? true,
        isSellable: optionalBoolean(v.IsSellable, 'IsSellable') ?? old?.isSellable ?? true,
        isPurchasable: optionalBoolean(v.IsPurchasable, 'IsPurchasable') ?? old?.isPurchasable ?? true };
      if (index < 0) mapped.push(updated); else mapped[index] = updated;
      await this.products.updateLocations(id, mapped, user.tenantId, manager);
      return;
    }
    if (row.sheet === 'product-attributes') {
      const existing = await manager.getRepository(ProductAttributes).findBy({ productId: id });
      const attribute = this.ref(refs.attributes, 'code', v.AttributeCode, 'AttributeCode');
      const mapped: NonNullable<CreateProductDto['productAttributes']> = existing.map((item) => ({ productAttributeId: Number(item.productAttributeId), attributeId: Number(item.attributeId), value: item.value }));
      const index = mapped.findIndex((item) => item.attributeId === Number(attribute.attributeId));
      const updated = { productAttributeId: index >= 0 ? mapped[index].productAttributeId : undefined, attributeId: Number(attribute.attributeId), value: v.Value };
      if (index < 0) mapped.push(updated); else mapped[index] = updated;
      await this.products.updateAttributes(id, mapped, user.tenantId, manager);
      return;
    }
    if (row.sheet === 'selling-prices') {
      const from = this.maintenanceDate(v.EffectiveFrom, 'EffectiveFrom', timeZone);
      const end = this.maintenanceDate(v.EffectiveTo, 'EffectiveTo', timeZone, true);
      const action = row.action === 'CREATE' ? 'ADD_INITIAL_PRICE' : row.action === 'REVISE' ? 'CHANGE_PRICE' : 'END_PRICE';
      await this.products.publishSellingPrices(id, { actions: [{ action, priceListItemId: row.recordId,
        priceListId: Number(this.ref(refs.lists, 'code', v.PriceListCode, 'PriceListCode').priceListId), productUnitId: row.parentId,
        currencyCode: currency(v.CurrencyCode, this.ref(refs.lists, 'code', v.PriceListCode, 'PriceListCode').currencyCode),
        minimumQuantity: Number(v.MinimumQuantity || 1), price: v.SellingPrice ? Number(v.SellingPrice) : undefined,
        effectiveMode: from && from > new Date() ? 'SCHEDULED' : 'NOW', effectiveFrom: from && from > new Date() ? from.toISOString() : undefined,
        effectiveTo: end?.toISOString() }] }, user.tenantId, user.userId, manager);
      return;
    }
    if (row.sheet === 'supplier-prices') {
      const from = this.supplierPriceDate(v.EffectiveFrom, 'EffectiveFrom', timeZone);
      const end = this.supplierPriceDate(v.EffectiveTo, 'EffectiveTo', timeZone, true);
      const action = row.action === 'CREATE' ? 'ADD_INITIAL_PRICE' : row.action === 'REVISE' ? 'CHANGE_PRICE' : 'END_PRICE';
      await this.products.publishSupplierPurchasePrices(id, { actions: [{ action, productSupplierPriceId: row.recordId,
        productSupplierUnitId: row.parentId, currencyCode: currency(v.CurrencyCode), minimumQuantity: Number(v.MinimumQuantity || 1),
        price: v.PurchasePrice ? Number(v.PurchasePrice) : undefined,
        effectiveMode: row.action === 'END' || from && from > new Date() ? 'SCHEDULED' : 'NOW', effectiveFrom: from && from > new Date() ? from.toISOString() : undefined,
        effectiveTo: end?.toISOString() }] }, user.tenantId, manager);
      return;
    }
    if (row.sheet === 'selling-discounts') {
      const from = this.maintenanceDate(v.EffectiveFrom, 'EffectiveFrom', timeZone);
      const end = this.maintenanceDate(v.EffectiveTo, 'EffectiveTo', timeZone, true);
      if (row.action === 'END') await this.discounts.endDiscount(row.recordId!, { effectiveTo: end!.toISOString() }, user.tenantId, user.userId, manager);
      else {
        const dto = { discountType: v.DiscountType as PriceListItemDiscountType, discountValue: v.DiscountValue,
          effectiveFrom: from!.toISOString(), effectiveTo: end?.toISOString() };
        if (row.action === 'CREATE') await this.discounts.publishDiscount(row.parentId!, dto, user.tenantId, user.userId, manager);
        else await this.discounts.changeDiscount(row.parentId!, dto, user.tenantId, user.userId, manager);
      }
      return;
    }
    throw new BadRequestException('Unsupported import operation.');
  }
}
