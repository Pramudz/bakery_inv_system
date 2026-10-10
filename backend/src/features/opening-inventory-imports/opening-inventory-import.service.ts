import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager, In } from 'typeorm';
import { tenantBusinessClock } from '../../common/business-date';
import { baseQuantity, checked, hasExactBaseQuantity, multiply, units } from '../../common/inventory-decimal';
import { TenantPrincipal } from '../auth/auth.types';
import { InventoryAgeLayer } from '../inventory-age-layers/inventory-age-layer.entity';
import { InventoryBalance } from '../inventory-balance/inventory-balance.entity';
import { InventoryBalanceService } from '../inventory-balance/inventory-balance.service';
import { InventoryAdjustmentLine } from '../inventory-adjustments/inventory-adjustment-line.entity';
import { InventoryAdjustmentReason } from '../inventory-adjustments/inventory-adjustment-reason.entity';
import { InventoryAdjustmentReasonsService } from '../inventory-adjustments/inventory-adjustment-reasons.service';
import { InventoryAdjustmentsService } from '../inventory-adjustments/inventory-adjustments.service';
import { lockOpeningTarget } from '../inventory-adjustments/inventory-opening-guard';
import { InventoryOpeningClaim } from '../inventory-adjustments/inventory-opening-claim.entity';
import { InventoryLedger } from '../inventory-ledger/inventory-ledger.entity';
import { Location } from '../locations/locations.entity';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { Product } from '../products/products.entity';
import { UnitOfMeasure } from '../units/units.entity';
import { OpeningInventoryImportBatch } from './opening-inventory-import-batch.entity';
import { OpeningRawRow, OpeningResultRow, openingResultsWorkbook, openingTemplate, openingValidationWorkbook, parseOpeningWorkbook } from './opening-inventory-import.excel';

const digest = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const code = (value: string) => value.trim().toUpperCase();
const positive4 = (value: string, label: string) => {
  if (!/^\d+(?:\.\d{1,4})?$/.test(value) || units(value) <= 0n) throw new BadRequestException(`${label} must be greater than zero with at most four decimal places.`);
  return checked(units(value));
};
const factorScaled = (value: string) => {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) throw new BadRequestException('Product Unit conversion factor must have at most six decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const scaled = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  if (scaled <= 0n) throw new BadRequestException('Product Unit conversion factor must be positive.');
  return scaled;
};

@Injectable()
export class OpeningInventoryImportService {
  constructor(private readonly dataSource: DataSource, private readonly balances: InventoryBalanceService,
    private readonly adjustments: InventoryAdjustmentsService, private readonly reasons: InventoryAdjustmentReasonsService) {}

  template(sample: boolean) { return openingTemplate(sample); }

  async preview(datasetInput: string, buffer: Buffer, user: TenantPrincipal) {
    const datasetId = datasetInput?.trim() ?? '';
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(datasetId)) throw new BadRequestException('Dataset ID must use 1–100 letters, numbers, dots, underscores or hyphens.');
    const raw = await parseOpeningWorkbook(buffer);
    const fileHash = createHash('sha256').update(buffer).digest('hex');
    const repo = this.dataSource.getRepository(OpeningInventoryImportBatch);
    let batch = await repo.findOneBy({ tenantId: user.tenantId, datasetId, fileHash });
    if (!batch) {
      try {
        batch = await repo.save(repo.create({ tenantId: user.tenantId, datasetId, fileHash, status: 'PREVIEW',
          rowsJson: JSON.stringify(raw), previewJson: null, resultsJson: null,
          createdByUserId: user.userId, confirmedByUserId: null, completedAt: null }));
      } catch (error) {
        if ((error as { code?: string }).code !== 'ER_DUP_ENTRY') throw error;
        batch = await repo.findOneByOrFail({ tenantId: user.tenantId, datasetId, fileHash });
      }
    }
    this.assertBatchAccess(batch, user);
    if (batch.status === 'COMPLETED') return this.format(batch, JSON.parse(batch.resultsJson!));
    const rows = await this.validate(raw, user, this.dataSource.manager);
    batch.previewJson = JSON.stringify(rows);
    await repo.update({ batchId: batch.batchId, tenantId: user.tenantId, status: 'PREVIEW' }, { previewJson: batch.previewJson });
    const latest = await repo.findOneByOrFail({ batchId: batch.batchId, tenantId: user.tenantId });
    this.assertBatchAccess(latest, user);
    return this.format(latest, JSON.parse(latest.status === 'COMPLETED' ? latest.resultsJson! : latest.previewJson!));
  }

  async get(batchId: number, user: TenantPrincipal) {
    const batch = await this.batch(this.dataSource.manager, batchId, user);
    const rows = JSON.parse(batch.status === 'COMPLETED' ? batch.resultsJson! : batch.previewJson ?? '[]') as OpeningResultRow[];
    return this.format(batch, rows);
  }

  async history(user: TenantPrincipal, page = 1, limit = 20) {
    if (!Number.isSafeInteger(page) || page < 1 || ![20, 50, 100].includes(limit)) throw new BadRequestException('Page must be positive and limit 20, 50 or 100.');
    const [rows, totalCount] = await this.dataSource.getRepository(OpeningInventoryImportBatch).findAndCount({
      where: { tenantId: user.tenantId, ...(user.accessScope === 'LOCATION' ? { createdByUserId: user.userId } : {}) },
      order: { createdAt: 'DESC', batchId: 'DESC' }, skip: (page - 1) * limit, take: limit,
    });
    return { items: rows.map(row => ({ batchId: Number(row.batchId), datasetId: row.datasetId, status: row.status,
      createdAt: row.createdAt, completedAt: row.completedAt })), page, limit, totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)) };
  }

  async validationReport(batchId: number, user: TenantPrincipal) {
    const batch = await this.batch(this.dataSource.manager, batchId, user);
    if (!batch.previewJson) throw new BadRequestException('Preview this workbook before downloading validation.');
    return openingValidationWorkbook(JSON.parse(batch.previewJson), batch.datasetId);
  }

  async results(batchId: number, user: TenantPrincipal) {
    const batch = await this.batch(this.dataSource.manager, batchId, user);
    if (batch.status !== 'COMPLETED' || !batch.resultsJson) throw new BadRequestException('Confirm this workbook before downloading results.');
    return openingResultsWorkbook(JSON.parse(batch.resultsJson), batch.datasetId);
  }

  async confirm(batchId: number, user: TenantPrincipal) {
    return this.dataSource.transaction('READ COMMITTED', async manager => {
      const batch = await manager.getRepository(OpeningInventoryImportBatch).findOne({
        where: { batchId, tenantId: user.tenantId }, lock: { mode: 'pessimistic_write' },
      });
      if (!batch) throw new NotFoundException('Opening inventory batch not found.');
      this.assertBatchAccess(batch, user);
      if (batch.status === 'COMPLETED') return this.format(batch, JSON.parse(batch.resultsJson!));
      if (!batch.previewJson) throw new BadRequestException('Preview the workbook before confirmation.');
      const raw = JSON.parse(batch.rowsJson) as OpeningRawRow[];
      const prelock = await this.validate(raw, user, manager);
      if (prelock.some(row => row.status === 'ERROR')) throw new ConflictException('Opening inventory preview is stale or contains errors. Upload and validate again.');
      // Hold master identity/eligibility stable through the recheck and posting.
      for (const productId of [...new Set(prelock.map(row => row.productId!))].sort((a, b) => a - b)) {
        if (!await manager.getRepository(Product).createQueryBuilder('product').setLock('pessimistic_write')
          .where('product.productId = :productId AND product.tenantId = :tenantId', { productId, tenantId: user.tenantId }).getOne())
          throw new ConflictException('A product changed after preview.');
      }
      for (const locationId of [...new Set(prelock.map(row => row.locationId!))].sort((a, b) => a - b)) {
        if (!await manager.getRepository(Location).createQueryBuilder('location').setLock('pessimistic_write')
          .where('location.locationId = :locationId AND location.tenantId = :tenantId', { locationId, tenantId: user.tenantId }).getOne())
          throw new ConflictException('A location changed after preview.');
      }
      for (const productUnitId of [...new Set(prelock.map(row => row.productUnitId!))].sort((a, b) => a - b)) {
        if (!await manager.getRepository(ProductUnit).createQueryBuilder('productUnit').setLock('pessimistic_write')
          .where('productUnit.productUnitId = :productUnitId', { productUnitId }).getOne())
          throw new ConflictException('A Product Unit changed after preview.');
      }
      const unitCodes = [...new Set(prelock.flatMap(row => [row.values.UnitCode, row.baseUnitCode!]).map(code).filter(Boolean))].sort();
      for (const unitCode of unitCodes) {
        if (!await manager.getRepository(UnitOfMeasure).createQueryBuilder('unit').setLock('pessimistic_write')
          .where('unit.tenantId = :tenantId AND UPPER(unit.code) = :unitCode',
            { tenantId: user.tenantId, unitCode }).getOne())
          throw new ConflictException('A Unit changed after preview.');
      }
      const targets = [...prelock].sort((a, b) => Number(a.locationId) - Number(b.locationId) || Number(a.productId) - Number(b.productId));
      for (const row of targets) await lockOpeningTarget(manager, this.balances, {
        tenantId: user.tenantId, locationId: row.locationId!, productId: row.productId!,
      });
      const rows = await this.validate(raw, user, manager);
      if (rows.some(row => row.status === 'ERROR') || digest(rows) !== digest(JSON.parse(batch.previewJson)))
        throw new ConflictException('Opening inventory preview is stale. Upload and validate again.');
      await this.reasons.ensureSystemReasons(manager, user.tenantId);
      const reason = await manager.getRepository(InventoryAdjustmentReason).findOneBy({ tenantId: user.tenantId, code: 'OPENING_INVENTORY', isActive: true });
      if (!reason || !reason.isSystemReason || reason.allowedDirection !== 'IN' || reason.costingPolicy !== 'MANUAL_REQUIRED' || reason.requiresApproval)
        throw new ConflictException('Tenant OPENING_INVENTORY reason is unavailable or has an unsafe configuration.');
      const clock = await tenantBusinessClock(manager, user.tenantId);
      const byLocation = new Map<number, OpeningResultRow[]>();
      for (const row of rows) byLocation.set(row.locationId!, [...(byLocation.get(row.locationId!) ?? []), row]);
      for (const [locationId, group] of [...byLocation].sort((a, b) => a[0] - b[0])) {
        const draft = await this.adjustments.createWithManager(manager, {
          locationId, movementType: 'ADJI', reasonId: Number(reason.inventoryAdjustmentReasonId),
          referenceNumber: batch.datasetId, remarks: `Opening inventory bulk import ${batch.datasetId}`,
          lines: group.map(row => ({ productId: row.productId!, productUnitId: row.productUnitId!,
            quantity: row.values.Quantity, unitCost: row.values.BaseUnitCost, remarks: row.values.Remarks || undefined })),
        }, user, clock);
        const posted = await this.adjustments.postWithManager(manager, Number(draft.inventoryAdjustmentId), {}, user, Number(batch.batchId), clock);
        const lines = await manager.getRepository(InventoryAdjustmentLine).findBy({ inventoryAdjustmentId: posted.inventoryAdjustmentId });
        for (const row of group) {
          const line = lines.find(item => Number(item.productId) === row.productId)!;
          const ledger = await manager.getRepository(InventoryLedger).findOneByOrFail({ tenantId: user.tenantId,
            sourceDocumentType: 'INVENTORY_ADJUSTMENT', sourceDocumentId: posted.inventoryAdjustmentId,
            sourceDocumentLineId: line.inventoryAdjustmentLineId, movementType: 'ADJI' });
          Object.assign(row, { status: 'POSTED', details: 'Opening inventory posted.', postingDate: clock.businessDate,
            adjustmentNumber: posted.adjustmentNumber, adjustmentId: Number(posted.inventoryAdjustmentId),
            ledgerId: Number(ledger.inventoryLedgerId), finalQuantity: line.quantityAfter, finalWavg: ledger.averageCostAfter });
        }
      }
      if ((await tenantBusinessClock(manager, user.tenantId)).businessDate !== clock.businessDate)
        throw new ConflictException('Tenant business date changed during confirmation. Preview and confirm again.');
      batch.resultsJson = JSON.stringify(rows); batch.status = 'COMPLETED'; batch.completedAt = clock.now;
      batch.confirmedByUserId = user.userId;
      await manager.getRepository(OpeningInventoryImportBatch).save(batch);
      return this.format(batch, rows);
    });
  }

  private async batch(manager: EntityManager, batchId: number, user: TenantPrincipal) {
    if (!Number.isSafeInteger(batchId) || batchId <= 0) throw new BadRequestException('Invalid batch ID.');
    const batch = await manager.getRepository(OpeningInventoryImportBatch).findOneBy({ batchId, tenantId: user.tenantId });
    if (!batch) throw new NotFoundException('Opening inventory batch not found.');
    this.assertBatchAccess(batch, user);
    return batch;
  }

  private assertBatchAccess(batch: OpeningInventoryImportBatch, user: TenantPrincipal) {
    if (user.accessScope !== 'LOCATION') return;
    if (Number(batch.createdByUserId) !== Number(user.userId)) throw new ForbiddenException('Import batch is outside your location scope.');
    const allowed = new Set(user.assignedLocationIds.map(Number));
    const rows = JSON.parse(batch.status === 'COMPLETED' ? batch.resultsJson ?? '[]' : batch.previewJson ?? '[]') as OpeningResultRow[];
    if (rows.some(row => row.locationId && !allowed.has(row.locationId)))
      throw new ForbiddenException('Import batch contains a location outside your current scope.');
  }

  private format(batch: OpeningInventoryImportBatch, rows: OpeningResultRow[]) {
    const totals = new Map<string, bigint>(); let value = 0n;
    for (const row of rows) if (row.status !== 'ERROR' && row.baseQuantity && row.baseUnitCode) {
      totals.set(row.baseUnitCode, (totals.get(row.baseUnitCode) ?? 0n) + units(row.baseQuantity));
      value += units(row.openingValue ?? '0');
    }
    return { batchId: Number(batch.batchId), datasetId: batch.datasetId, status: batch.status,
      rows, summary: { totalRows: rows.length, readyRows: rows.filter(row => row.status === 'READY').length,
        errorRows: rows.filter(row => row.status === 'ERROR').length, postedRows: rows.filter(row => row.status === 'POSTED').length,
        locationsAffected: new Set(rows.filter(row => row.status !== 'ERROR').map(row => row.values.LocationCode)).size,
        baseQuantitiesByUnit: Object.fromEntries([...totals].map(([unit, quantity]) => [unit, checked(quantity)])),
        totalOpeningValue: checked(value) } };
  }

  private async validate(raw: OpeningRawRow[], user: TenantPrincipal, manager: EntityManager): Promise<OpeningResultRow[]> {
    const skus = [...new Set(raw.map(row => code(row.values.SKU)).filter(Boolean))];
    const locationCodes = [...new Set(raw.map(row => code(row.values.LocationCode)).filter(Boolean))];
    const unitCodes = [...new Set(raw.map(row => code(row.values.UnitCode)).filter(Boolean))];
    const products = skus.length ? await manager.getRepository(Product).createQueryBuilder('product')
      .where('product.tenantId = :tenantId AND UPPER(product.sku) IN (:...skus)', { tenantId: user.tenantId, skus }).getMany() : [];
    const locations = locationCodes.length ? await manager.getRepository(Location).createQueryBuilder('location')
      .where('location.tenantId = :tenantId AND UPPER(location.code) IN (:...codes)', { tenantId: user.tenantId, codes: locationCodes }).getMany() : [];
    const uoms = unitCodes.length ? await manager.getRepository(UnitOfMeasure).createQueryBuilder('unit')
      .where('unit.tenantId = :tenantId AND UPPER(unit.code) IN (:...codes)', { tenantId: user.tenantId, codes: unitCodes }).getMany() : [];
    const productIds = products.map(product => product.productId);
    const baseUnits = products.length ? await manager.getRepository(UnitOfMeasure)
      .findBy({ unitId: In([...new Set(products.map(product => product.baseUnitId))]), tenantId: user.tenantId }) : [];
    const productUnits = productIds.length ? await manager.getRepository(ProductUnit).findBy({ productId: In(productIds) }) : [];
    const locationIds = locations.map(location => location.locationId);
    const productLocations = productIds.length && locationIds.length
      ? await manager.getRepository(ProductLocation).findBy({ productId: In(productIds), locationId: In(locationIds) }) : [];
    const seen = new Set<string>();
    const output: OpeningResultRow[] = [];
    for (const source of raw) {
      const row: OpeningResultRow = { ...source, status: 'READY', details: '', historicalMovement: false, openingClaim: false };
      const problems: string[] = [];
      const add = (message: string) => { problems.push(message); };
      const product = products.find(item => code(item.sku) === code(source.values.SKU));
      const location = locations.find(item => code(item.code) === code(source.values.LocationCode));
      const unit = uoms.find(item => code(item.code) === code(source.values.UnitCode));
      if (!source.values.SKU || !product) add('SKU is not an existing product for this tenant.');
      if (!source.values.LocationCode || !location) add('LocationCode is not an existing location for this tenant.');
      if (!source.values.UnitCode || !unit) add('UnitCode is not an existing unit for this tenant.');
      if (product) {
        row.productId = Number(product.productId); row.productName = product.productName;
        if (!product.isActive || !product.isStockItem) add('Product must be active and stock eligible.');
        if (product.trackBatch || product.trackExpiry || product.trackSerial) add('Batch, expiry or serial tracked products are unsupported.');
      }
      if (location) {
        const assigned = user.accessScope !== 'LOCATION' || user.assignedLocationIds.map(Number).includes(Number(location.locationId));
        if (assigned) row.locationId = Number(location.locationId);
        if (!location.isActive) add('Location is inactive.');
        if (!assigned) add('Location is outside your assigned scope.');
      }
      if (unit && !unit.isActive) add('Unit is inactive.');
      const authorizedLocation = location && (user.accessScope !== 'LOCATION' || user.assignedLocationIds.map(Number).includes(Number(location.locationId)));
      if (product && authorizedLocation) {
        const key = `${product.productId}:${location.locationId}`;
        if (seen.has(key)) add('Duplicate product/location row in this workbook.');
        seen.add(key);
        const link = productLocations.find(item => Number(item.productId) === Number(product.productId) && Number(item.locationId) === Number(location.locationId));
        if (!link?.isActive) add('Product is not active at this location.');
        const balance = await manager.getRepository(InventoryBalance).findOneBy({ tenantId: user.tenantId,
          locationId: location.locationId, productId: product.productId });
        row.existingQuantity = balance?.quantityOnHand ?? '0.0000'; row.existingWavg = balance?.averageCost ?? '0.0000';
        const scope = { tenantId: user.tenantId, locationId: location.locationId, productId: product.productId };
        row.historicalMovement = Boolean(await manager.getRepository(InventoryLedger).findOneBy(scope));
        row.openingClaim = Boolean(await manager.getRepository(InventoryOpeningClaim).findOneBy(scope));
        const ageLayer = await manager.getRepository(InventoryAgeLayer).findOneBy(scope);
        if (row.historicalMovement || row.openingClaim || ageLayer ||
          (balance && (units(balance.quantityOnHand) !== 0n || units(balance.averageCost) !== 0n || balance.lastMovementAt !== null)))
          add('Prior inventory movement, opening claim or unsafe balance/layer state exists for this product/location.');
      }
      const productUnit = product && unit ? productUnits.find(item => Number(item.productId) === Number(product.productId) && Number(item.unitId) === Number(unit.unitId)) : null;
      if (product && unit && !productUnit?.isActive)
        add('Unit is not an eligible active Product Unit for this product.');
      if (productUnit) { row.productUnitId = Number(productUnit.productUnitId); row.conversionFactor = String(productUnit.conversionFactor); }
      if (product) {
        const base = baseUnits.find(item => Number(item.unitId) === Number(product.baseUnitId));
        if (!base?.isActive) add('Product base unit is unavailable or inactive.');
        else row.baseUnitCode = base.code;
        if (productUnit?.isBaseUnit && (Number(productUnit.unitId) !== Number(product.baseUnitId) || !/^1(?:\.0{1,6})?$/.test(String(productUnit.conversionFactor))))
          add('Base Product Unit configuration is inconsistent.');
      }
      try {
        const quantity = positive4(source.values.Quantity, 'Quantity');
        const cost = positive4(source.values.BaseUnitCost, 'BaseUnitCost');
        if (unit) {
          const fraction = (source.values.Quantity.split('.')[1] ?? '').replace(/0+$/, '');
          if ((!unit.allowsDecimalQuantity && fraction.length) || fraction.length > unit.quantityPrecision)
            add('Quantity exceeds the Unit precision.');
        }
        if (productUnit) {
          factorScaled(String(productUnit.conversionFactor));
          if (!hasExactBaseQuantity(quantity, String(productUnit.conversionFactor))) add('Conversion would round the base quantity; use an exact quantity.');
          else {
            row.baseQuantity = baseQuantity(quantity, String(productUnit.conversionFactor));
            if (units(row.baseQuantity) <= 0n) add('Converted base quantity must be positive.');
            row.openingValue = checked(multiply(units(row.baseQuantity), units(cost)));
          }
        }
      } catch (error) { add(error instanceof Error ? error.message : 'Invalid quantity, cost or conversion.'); }
      if (source.values.Remarks.length > 2000) add('Remarks exceeds 2,000 characters.');
      if (source.values.RowReference.length > 100) add('RowReference exceeds 100 characters.');
      if (problems.length) { row.status = 'ERROR'; row.details = problems.join(' '); }
      else row.details = 'Ready to post.';
      output.push(row);
    }
    return output;
  }
}
