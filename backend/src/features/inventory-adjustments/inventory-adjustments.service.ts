import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { tenantBusinessClock } from '../../common/business-date';
import { baseQuantity, checked, units } from '../../common/inventory-decimal';
import { InventoryAgeLayer } from '../inventory-age-layers/inventory-age-layer.entity';
import { InventoryAgeLayerService } from '../inventory-age-layers/inventory-age-layer.service';
import { TenantPrincipal } from '../auth/auth.types';
import { InventoryBalance } from '../inventory-balance/inventory-balance.entity';
import { InventoryBalanceService } from '../inventory-balance/inventory-balance.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { Location } from '../locations/locations.entity';
import { NumberSequenceKeys } from '../number-sequences/number-sequence-keys';
import { formatInventoryAdjustmentNumber } from '../number-sequences/number-sequence-formatters';
import { NumberSequencesService } from '../number-sequences/number-sequences.service';
import { Permission } from '../permissions/permissions.entity';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { Product } from '../products/products.entity';
import { RolePermission } from '../role-permissions/role-permissions.entity';
import { CreateInventoryAdjustmentDto, InventoryAdjustmentLineDto, PostInventoryAdjustmentDto, UpdateInventoryAdjustmentDto } from './dto/inventory-adjustment.dto';
import { InventoryAdjustmentLine } from './inventory-adjustment-line.entity';
import { InventoryAdjustmentReason } from './inventory-adjustment-reason.entity';
import { InventoryAdjustment } from './inventory-adjustment.entity';
import { InventoryAdjustmentReasonsService } from './inventory-adjustment-reasons.service';

export type InventoryAdjustmentListItem = InventoryAdjustment & {
  createdByName: string | null;
  postedByName: string | null;
  lineCount: number;
  valueImpact: string | null;
};

export interface InventoryAdjustmentPage {
  items: InventoryAdjustmentListItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class InventoryAdjustmentsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly balances: InventoryBalanceService,
    private readonly ledgers: InventoryLedgerService,
    private readonly ageLayers: InventoryAgeLayerService,
    private readonly numberSequences: NumberSequencesService,
    private readonly reasons: InventoryAdjustmentReasonsService,
  ) {}

  async list(user: TenantPrincipal, filters: { page: number; limit: number; search: string; status: string; movementType: string; reasonId?: number; locationId?: number; dateFrom?: string; dateTo?: string }): Promise<InventoryAdjustmentPage> {
    const page = Number.isSafeInteger(filters.page) && filters.page > 0 ? filters.page : 1;
    const limit = [20, 50, 100].includes(filters.limit) ? filters.limit : 20;
    const query = this.dataSource.getRepository(InventoryAdjustment).createQueryBuilder('adjustment')
      .leftJoinAndSelect('adjustment.reason', 'reason').leftJoinAndSelect('adjustment.location', 'location')
      .leftJoin('adjustment.createdByUser', 'createdByUser')
      .leftJoin('adjustment.postedByUser', 'postedByUser')
      .where('adjustment.tenantId = :tenantId', { tenantId: user.tenantId });
    if (user.accessScope === 'LOCATION') {
      if (!user.assignedLocationIds.length) query.andWhere('1 = 0');
      else query.andWhere('adjustment.locationId IN (:...locationIds)', { locationIds: user.assignedLocationIds.map(Number) });
    }
    if (filters.search.trim()) query.andWhere(`(LOWER(COALESCE(adjustment.adjustmentNumber, '')) LIKE :search OR LOWER(COALESCE(adjustment.referenceNumber, '')) LIKE :search OR LOWER(COALESCE(adjustment.remarks, '')) LIKE :search)`, { search: `%${filters.search.trim().toLowerCase()}%` });
    if (['DRAFT', 'POSTED', 'CANCELLED'].includes(filters.status.toUpperCase())) query.andWhere('adjustment.status = :status', { status: filters.status.toUpperCase() });
    if (['ADJI', 'ADJO'].includes(filters.movementType.toUpperCase())) query.andWhere('adjustment.movementType = :movementType', { movementType: filters.movementType.toUpperCase() });
    if (Number.isSafeInteger(filters.reasonId) && Number(filters.reasonId) > 0) query.andWhere('adjustment.reasonId = :reasonId', { reasonId: filters.reasonId });
    if (Number.isSafeInteger(filters.locationId) && Number(filters.locationId) > 0) query.andWhere('adjustment.locationId = :locationId', { locationId: filters.locationId });
    if (filters.dateFrom) query.andWhere('adjustment.adjustmentDate >= :dateFrom', { dateFrom: filters.dateFrom.slice(0, 10) });
    if (filters.dateTo) query.andWhere('adjustment.adjustmentDate <= :dateTo', { dateTo: filters.dateTo.slice(0, 10) });
    const total = await query.clone().getCount();
    const result = await query
      .addSelect(`COALESCE(NULLIF(TRIM(CONCAT_WS(' ', createdByUser.firstName, createdByUser.lastName)), ''), NULLIF(createdByUser.username, ''), createdByUser.email)`, 'createdByName')
      .addSelect(`COALESCE(NULLIF(TRIM(CONCAT_WS(' ', postedByUser.firstName, postedByUser.lastName)), ''), NULLIF(postedByUser.username, ''), postedByUser.email)`, 'postedByName')
      .addSelect(subQuery => subQuery.select('COUNT(lineCount.inventoryAdjustmentLineId)').from(InventoryAdjustmentLine, 'lineCount').where('lineCount.inventoryAdjustmentId = adjustment.inventoryAdjustmentId'), 'lineCount')
      .addSelect(subQuery => subQuery.select('SUM(lineValue.inventoryValue)').from(InventoryAdjustmentLine, 'lineValue').where('lineValue.inventoryAdjustmentId = adjustment.inventoryAdjustmentId'), 'postedValueTotal')
      .orderBy('adjustment.inventoryAdjustmentId', 'DESC').skip((page - 1) * limit).take(limit).getRawAndEntities();
    const rawRows = result.raw as Array<{ createdByName?: string | null; postedByName?: string | null; lineCount?: string | number | null; postedValueTotal?: string | null }>;
    const items = result.entities.map((adjustment, index) => {
      const raw = rawRows[index] ?? {};
      const postedTotal = adjustment.status === 'POSTED' ? checked(units(raw.postedValueTotal ?? '0')) : null;
      const valueImpact = postedTotal === null ? null : adjustment.movementType === 'ADJO' && units(postedTotal) !== 0n ? `-${postedTotal}` : postedTotal;
      return {
        ...adjustment,
        createdByName: raw.createdByName ?? null,
        postedByName: adjustment.status === 'POSTED' ? raw.postedByName ?? null : null,
        lineCount: Number(raw.lineCount ?? 0),
        valueImpact,
      };
    });
    return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async productContexts(user: TenantPrincipal, filters: { locationId: number; page: number; limit: number; search: string; productId?: number }) {
    if (!Number.isSafeInteger(filters.locationId) || filters.locationId <= 0) throw new BadRequestException('A valid location is required for product search.');
    await this.assertLocationAccess(this.dataSource.manager, user, filters.locationId, true);
    const page = Number.isSafeInteger(filters.page) && filters.page > 0 ? filters.page : 1;
    const limit = [20, 50, 100].includes(filters.limit) ? filters.limit : 20;
    const query = this.dataSource.getRepository(Product).createQueryBuilder('product')
      .innerJoin('product.productLocations', 'productLocation', 'productLocation.locationId = :locationId AND productLocation.isActive = true', { locationId: filters.locationId })
      .leftJoinAndSelect('product.baseUnit', 'baseUnit')
      .leftJoinAndSelect('product.productUnits', 'productUnit', 'productUnit.isActive = true')
      .leftJoinAndSelect('productUnit.unit', 'unit')
      .leftJoinAndMapOne('product.inventoryBalance', 'product.inventoryBalances', 'inventoryBalance', 'inventoryBalance.tenantId = :tenantId AND inventoryBalance.locationId = :locationId', { tenantId: user.tenantId, locationId: filters.locationId })
      .where('product.tenantId = :tenantId AND product.isActive = true AND product.isStockItem = true', { tenantId: user.tenantId });
    if (Number.isSafeInteger(filters.productId) && Number(filters.productId) > 0) query.andWhere('product.productId = :productId', { productId: filters.productId });
    if (filters.search.trim()) query.andWhere('(LOWER(product.sku) LIKE :search OR LOWER(product.productName) LIKE :search)', { search: `%${filters.search.trim().toLowerCase()}%` });
    const [products, total] = await query.orderBy('product.productName', 'ASC').addOrderBy('product.productId', 'ASC').skip((page - 1) * limit).take(limit).getManyAndCount();
    const items = products.map(product => {
      const balance = (product as Product & { inventoryBalance?: InventoryBalance | null }).inventoryBalance;
      return {
        productId: Number(product.productId),
        sku: product.sku,
        productName: product.productName,
        baseUnit: { unitId: Number(product.baseUnit.unitId), code: product.baseUnit.code, name: product.baseUnit.name, symbol: product.baseUnit.symbol },
        productUnits: product.productUnits.map(productUnit => ({
          productUnitId: Number(productUnit.productUnitId), unitId: Number(productUnit.unitId), conversionFactor: productUnit.conversionFactor,
          isBaseUnit: productUnit.isBaseUnit, unit: { unitId: Number(productUnit.unit.unitId), code: productUnit.unit.code, name: productUnit.unit.name, symbol: productUnit.unit.symbol },
        })),
        quantityOnHand: balance?.quantityOnHand ?? '0.0000',
        averageCost: balance?.averageCost ?? null,
        hasInventoryBalance: Boolean(balance),
      };
    });
    return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async locations(user: TenantPrincipal) {
    const query = this.dataSource.getRepository(Location).createQueryBuilder('location')
      .where('location.tenantId = :tenantId AND location.isActive = true', { tenantId: user.tenantId });
    if (user.accessScope === 'LOCATION') {
      if (!user.assignedLocationIds.length) query.andWhere('1 = 0');
      else query.andWhere('location.locationId IN (:...locationIds)', { locationIds: user.assignedLocationIds.map(Number) });
    }
    const rows = await query.orderBy('location.name', 'ASC').addOrderBy('location.locationId', 'ASC').getMany();
    return rows.map(location => ({ locationId: Number(location.locationId), code: location.code, name: location.name, isActive: location.isActive }));
  }

  async get(id: number, user: TenantPrincipal) {
    this.assertId(id);
    const adjustment = await this.dataSource.getRepository(InventoryAdjustment).findOne({ where: { inventoryAdjustmentId: id, tenantId: user.tenantId }, relations: { reason: true, location: true, createdByUser: true, postedByUser: true, cancelledByUser: true } });
    if (!adjustment) throw new NotFoundException('Inventory adjustment not found.');
    await this.assertLocationAccess(this.dataSource.manager, user, Number(adjustment.locationId));
    const lines = await this.dataSource.getRepository(InventoryAdjustmentLine).find({ where: { inventoryAdjustmentId: id }, relations: { product: { baseUnit: true }, productUnit: { unit: true } }, order: { inventoryAdjustmentLineId: 'ASC' } });
    return { ...adjustment, lines };
  }

  async create(dto: CreateInventoryAdjustmentDto, user: TenantPrincipal) {
    return this.dataSource.transaction(async manager => {
      const clock = await tenantBusinessClock(manager, user.tenantId);
      await this.assertLocationAccess(manager, user, Number(dto.locationId), true);
      const reason = await this.assertReason(manager, user.tenantId, Number(dto.reasonId), dto.movementType);
      this.assertRemarks(reason, dto.remarks);
      const repository = manager.getRepository(InventoryAdjustment);
      const adjustment = await repository.save(repository.create({ tenantId: user.tenantId, locationId: Number(dto.locationId), movementType: dto.movementType, reasonId: Number(dto.reasonId), adjustmentDate: clock.businessDate, referenceNumber: dto.referenceNumber?.trim() || null, remarks: dto.remarks?.trim() || null, status: 'DRAFT', createdByUserId: user.userId, postedByUserId: null, postedAt: null, cancelledByUserId: null, cancelledAt: null, isActive: true }));
      await this.saveLines(manager, adjustment, dto.lines, reason);
      return adjustment;
    });
  }

  async update(id: number, dto: UpdateInventoryAdjustmentDto, user: TenantPrincipal) {
    return this.dataSource.transaction(async manager => {
      const adjustment = await this.lock(manager, id, user.tenantId);
      await this.assertLocationAccess(manager, user, Number(adjustment.locationId));
      if (adjustment.status !== 'DRAFT') throw new BadRequestException('Only draft inventory adjustments can be edited.');
      const locationId = Number(dto.locationId ?? adjustment.locationId);
      const movementType = dto.movementType ?? adjustment.movementType;
      const reasonId = Number(dto.reasonId ?? adjustment.reasonId);
      await this.assertLocationAccess(manager, user, locationId, true);
      const reason = await this.assertReason(manager, user.tenantId, reasonId, movementType);
      const remarks = dto.remarks === undefined ? adjustment.remarks : dto.remarks?.trim() || null;
      this.assertRemarks(reason, remarks ?? undefined);
      Object.assign(adjustment, { locationId, movementType, reasonId, referenceNumber: dto.referenceNumber === undefined ? adjustment.referenceNumber : dto.referenceNumber?.trim() || null, remarks });
      await manager.getRepository(InventoryAdjustment).save(adjustment);
      if (dto.lines) {
        await manager.getRepository(InventoryAdjustmentLine).delete({ inventoryAdjustmentId: id });
        await this.saveLines(manager, adjustment, dto.lines, reason);
      } else {
        const lines = await manager.getRepository(InventoryAdjustmentLine).findBy({ inventoryAdjustmentId: id });
        this.assertStoredLines(lines, reason);
      }
      return adjustment;
    });
  }

  async cancel(id: number, user: TenantPrincipal) {
    return this.dataSource.transaction(async manager => {
      const adjustment = await this.lock(manager, id, user.tenantId);
      await this.assertLocationAccess(manager, user, Number(adjustment.locationId));
      if (adjustment.status !== 'DRAFT') throw new BadRequestException('Only draft inventory adjustments can be cancelled.');
      Object.assign(adjustment, { status: 'CANCELLED', cancelledByUserId: user.userId, cancelledAt: new Date() });
      return manager.getRepository(InventoryAdjustment).save(adjustment);
    });
  }

  async post(id: number, dto: PostInventoryAdjustmentDto, user: TenantPrincipal) {
    return this.dataSource.transaction(async manager => {
      const clock = await tenantBusinessClock(manager, user.tenantId);
      const adjustment = await this.lock(manager, id, user.tenantId);
      await this.assertLocationAccess(manager, user, Number(adjustment.locationId), true);
      if (adjustment.status !== 'DRAFT') throw new BadRequestException('Only draft inventory adjustments can be posted.');
      const reason = await this.assertReason(manager, user.tenantId, Number(adjustment.reasonId), adjustment.movementType);
      this.assertRemarks(reason, adjustment.remarks ?? undefined);
      if (reason.requiresApproval) throw new BadRequestException('This reason requires an approval workflow and cannot be posted directly.');
      if (reason.code === 'OPENING_INVENTORY') await this.assertOpeningPermission(manager, user);

      const lines = await manager.getRepository(InventoryAdjustmentLine).createQueryBuilder('line').setLock('pessimistic_write').where('line.inventoryAdjustmentId = :id', { id }).getMany();
      lines.sort((a, b) => Number(a.productId) - Number(b.productId) || Number(a.inventoryAdjustmentLineId) - Number(b.inventoryAdjustmentLineId));
      if (!lines.length) throw new BadRequestException('Inventory adjustment requires at least one line.');
      this.assertStoredLines(lines, reason);

      const plans: Array<{ line: InventoryAdjustmentLine; balance: InventoryBalance | null; layers: InventoryAgeLayer[]; snapshot: ReturnType<InventoryBalanceService['adjustmentSnapshot']>; unitCost: string }> = [];
      for (const line of lines) {
        await this.validateStoredLine(manager, adjustment, line);
        await this.lockProductLocation(manager, Number(adjustment.locationId), Number(line.productId));
        const balance = await this.balances.lock(manager, user.tenantId, Number(adjustment.locationId), Number(line.productId));
        const unitCost = this.postingUnitCost(adjustment, reason, balance, line);
        const snapshot = this.balances.adjustmentSnapshot(balance, line.baseQuantity, unitCost, adjustment.movementType === 'ADJI' ? 'IN' : 'OUT');
        const layers = adjustment.movementType === 'ADJO' ? await manager.getRepository(InventoryAgeLayer).createQueryBuilder('layer').setLock('pessimistic_write')
          .where('layer.tenantId = :tenantId AND layer.locationId = :locationId AND layer.productId = :productId', { tenantId: user.tenantId, locationId: adjustment.locationId, productId: line.productId })
          .orderBy('layer.receiptDate', 'ASC').addOrderBy('layer.inventoryAgeLayerId', 'ASC').getMany() : [];
        plans.push({ line, balance, layers, snapshot, unitCost });
      }
      if (plans.some(plan => plan.snapshot.createsNegativeStock) && dto.confirmNegativeStock !== true)
        throw new BadRequestException('This adjustment will create negative stock. Explicitly confirm negative stock to post.');

      const year = clock.businessDate.slice(0, 4);
      const nextNumber = await this.numberSequences.getTenantNextNumber(manager, user.tenantId, NumberSequenceKeys.STOCK_ADJUSTMENT, year);
      adjustment.adjustmentNumber = formatInventoryAdjustmentNumber(user.tenantId, year, nextNumber);
      for (const plan of plans) {
        const { line, balance, snapshot, unitCost } = plan;
        await this.balances.applyAdjustment(manager, balance, { tenantId: user.tenantId, locationId: Number(adjustment.locationId), productId: Number(line.productId) }, snapshot, clock.now);
        const ageLayerRelief = adjustment.movementType === 'ADJO' ? await this.ageLayers.relieve(manager, plan.layers, { quantity: line.baseQuantity }) : null;
        await this.ledgers.insert(manager, {
          tenantId: user.tenantId, locationId: Number(adjustment.locationId), productId: Number(line.productId),
          movementDate: clock.now, businessDate: clock.businessDate, movementType: adjustment.movementType, sourceDocumentType: 'INVENTORY_ADJUSTMENT',
          sourceDocumentId: adjustment.inventoryAdjustmentId, sourceDocumentLineId: line.inventoryAdjustmentLineId,
          quantityIn: adjustment.movementType === 'ADJI' ? line.baseQuantity : '0.0000', quantityOut: adjustment.movementType === 'ADJO' ? line.baseQuantity : '0.0000',
          unitCost, movementValue: snapshot.movementValue, quantityBefore: snapshot.quantityBefore, quantityAfter: snapshot.quantityAfter,
          averageCostBefore: snapshot.averageCostBefore, averageCostAfter: snapshot.averageCostAfter,
          valuationMethod: reason.costingPolicy, originalDocumentValue: snapshot.movementValue, inventoryReliefValue: snapshot.movementValue, costVariance: '0.0000',
          reversalOfLedgerId: null, inventoryAdjustmentReasonId: reason.inventoryAdjustmentReasonId, ageLayerRelief, createdByUserId: user.userId,
        });
        if (adjustment.movementType === 'ADJI') await this.ageLayers.insert(manager, {
          tenantId: user.tenantId, locationId: Number(adjustment.locationId), productId: Number(line.productId), sourceDocumentType: 'INVENTORY_ADJUSTMENT',
          sourceDocumentId: adjustment.inventoryAdjustmentId, sourceDocumentLineId: line.inventoryAdjustmentLineId, receiptDate: clock.businessDate,
          originalQuantity: line.baseQuantity, remainingQuantity: line.baseQuantity, originalUnitCost: unitCost,
          batchNumber: null, manufactureDate: null, expiryDate: null, isActive: true,
        });
        Object.assign(line, { unitCost, inventoryValue: snapshot.movementValue, quantityBefore: snapshot.quantityBefore, quantityAfter: snapshot.quantityAfter });
        await manager.getRepository(InventoryAdjustmentLine).save(line);
      }
      Object.assign(adjustment, { status: 'POSTED', postedByUserId: user.userId, postedAt: clock.now });
      return manager.getRepository(InventoryAdjustment).save(adjustment);
    });
  }

  private async saveLines(manager: EntityManager, adjustment: InventoryAdjustment, rows: InventoryAdjustmentLineDto[], reason: InventoryAdjustmentReason) {
    if (!Array.isArray(rows) || !rows.length) throw new BadRequestException('At least one adjustment line is required.');
    const products = new Set<number>();
    for (const row of rows) {
      const productId = Number(row.productId), productUnitId = Number(row.productUnitId);
      if (products.has(productId)) throw new BadRequestException('A product can appear only once in an inventory adjustment.');
      products.add(productId);
      const { productUnit } = await this.validateProductUnit(manager, adjustment.tenantId, Number(adjustment.locationId), productId, productUnitId);
      const quantity = checked(units(row.quantity));
      if (units(quantity) <= 0n) throw new BadRequestException('Adjustment quantity must be greater than zero.');
      const converted = baseQuantity(quantity, productUnit.conversionFactor);
      if (units(converted) <= 0n) throw new BadRequestException('Adjustment base quantity must be greater than zero.');
      const unitCost = row.unitCost === undefined ? null : checked(units(row.unitCost));
      if (unitCost !== null && units(unitCost) < 0n) throw new BadRequestException('Unit cost cannot be negative.');
      if (reason.costingPolicy === 'MANUAL_REQUIRED' && unitCost === null) throw new BadRequestException('A manual base-unit cost is required for this adjustment reason.');
      const repository = manager.getRepository(InventoryAdjustmentLine);
      await repository.save(repository.create({ inventoryAdjustmentId: adjustment.inventoryAdjustmentId, productId, productUnitId, conversionFactorSnapshot: String(productUnit.conversionFactor), quantity, baseQuantity: converted, unitCost: reason.costingPolicy === 'MANUAL_REQUIRED' ? unitCost : null, inventoryValue: null, quantityBefore: null, quantityAfter: null, remarks: row.remarks?.trim() || null }));
    }
  }

  private assertStoredLines(lines: InventoryAdjustmentLine[], reason: InventoryAdjustmentReason) {
    if (!lines.length) throw new BadRequestException('At least one adjustment line is required.');
    for (const line of lines) {
      if (units(line.quantity) <= 0n || units(line.baseQuantity) <= 0n) throw new BadRequestException('Adjustment line quantities must be greater than zero.');
      if (reason.costingPolicy === 'MANUAL_REQUIRED' && line.unitCost == null) throw new BadRequestException('A manual base-unit cost is required for this adjustment reason.');
    }
  }

  private postingUnitCost(adjustment: InventoryAdjustment, reason: InventoryAdjustmentReason, balance: InventoryBalance | null, line: InventoryAdjustmentLine) {
    if (reason.costingPolicy === 'MANUAL_REQUIRED') return checked(units(line.unitCost!));
    if (adjustment.movementType === 'ADJI' && (!balance || balance.averageCost == null || units(balance.averageCost) <= 0n))
      throw new BadRequestException('Current WAVG is not available for this product/location. Use an adjustment reason that requires manual cost.');
    return checked(units(balance?.averageCost ?? '0'));
  }

  private async validateStoredLine(manager: EntityManager, adjustment: InventoryAdjustment, line: InventoryAdjustmentLine) {
    const { productUnit } = await this.validateProductUnit(manager, adjustment.tenantId, Number(adjustment.locationId), Number(line.productId), Number(line.productUnitId));
    if (String(productUnit.conversionFactor) !== String(line.conversionFactorSnapshot) || baseQuantity(line.quantity, line.conversionFactorSnapshot) !== checked(units(line.baseQuantity)))
      throw new BadRequestException('Adjustment line product-unit conversion snapshot is invalid or has changed; edit the draft before posting.');
  }

  private async validateProductUnit(manager: EntityManager, tenantId: number, locationId: number, productId: number, productUnitId: number) {
    const product = await manager.getRepository(Product).findOneBy({ productId, tenantId, isActive: true, isStockItem: true });
    if (!product) throw new BadRequestException('Product is not an active stock item for this tenant.');
    const productLocation = await manager.getRepository(ProductLocation).findOneBy({ productId, locationId, isActive: true });
    if (!productLocation) throw new BadRequestException('Product is not active at the selected location.');
    const productUnit = await manager.getRepository(ProductUnit).findOneBy({ productUnitId, productId, isActive: true });
    if (!productUnit) throw new BadRequestException('Product unit is not active for this product.');
    return { product, productUnit };
  }

  private async assertReason(manager: EntityManager, tenantId: number, reasonId: number, movementType: 'ADJI' | 'ADJO') {
    await this.reasons.ensureSystemReasons(manager, tenantId);
    const reason = await manager.getRepository(InventoryAdjustmentReason).findOneBy({ inventoryAdjustmentReasonId: reasonId, tenantId, isActive: true });
    if (!reason) throw new BadRequestException('Adjustment reason is not active for this tenant.');
    const direction = movementType === 'ADJI' ? 'IN' : 'OUT';
    if (![direction, 'BOTH'].includes(reason.allowedDirection)) throw new BadRequestException('Adjustment reason is not valid for this movement direction.');
    if (movementType === 'ADJO' && reason.costingPolicy !== 'CURRENT_WAVG') throw new BadRequestException('Adjustment-out must use current WAVG costing.');
    return reason;
  }

  private assertRemarks(reason: InventoryAdjustmentReason, remarks?: string | null) {
    if (reason.requiresRemarks && !remarks?.trim()) throw new BadRequestException('Remarks are required for the selected adjustment reason.');
  }

  private async assertOpeningPermission(manager: EntityManager, user: TenantPrincipal) {
    if (user.roleCode === 'TENANT_ADMIN') return;
    const permission = await manager.getRepository(Permission).findOneBy({ code: 'INVENTORY_OPENING_POST', isActive: true });
    if (!permission || !await manager.getRepository(RolePermission).findOneBy({ roleId: user.roleId, permissionId: permission.permissionId }))
      throw new ForbiddenException('Opening inventory posting permission is required.');
  }

  private async lockProductLocation(manager: EntityManager, locationId: number, productId: number) {
    const context = await manager.getRepository(ProductLocation).createQueryBuilder('productLocation').setLock('pessimistic_write')
      .where('productLocation.productId = :productId AND productLocation.locationId = :locationId AND productLocation.isActive = true', { productId, locationId }).getOne();
    if (!context) throw new BadRequestException('Product location is not configured for inventory posting.');
  }

  private async assertLocationAccess(manager: EntityManager, user: TenantPrincipal, locationId: number, requireActive = false) {
    if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(locationId)) throw new ForbiddenException('User is not assigned to this location.');
    const location = await manager.getRepository(Location).findOneBy({ locationId, tenantId: user.tenantId, ...(requireActive ? { isActive: true } : {}) });
    if (!location) throw new NotFoundException('Location not found.');
  }

  private async lock(manager: EntityManager, id: number, tenantId: number) {
    this.assertId(id);
    const adjustment = await manager.getRepository(InventoryAdjustment).createQueryBuilder('adjustment').setLock('pessimistic_write')
      .where('adjustment.inventoryAdjustmentId = :id AND adjustment.tenantId = :tenantId', { id, tenantId }).getOne();
    if (!adjustment) throw new NotFoundException('Inventory adjustment not found.');
    return adjustment;
  }

  private assertId(id: number) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new BadRequestException('Invalid inventory adjustment ID.');
  }
}
