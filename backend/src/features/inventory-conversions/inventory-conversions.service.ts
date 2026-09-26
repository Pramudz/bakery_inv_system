import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { tenantBusinessClock } from '../../common/business-date';
import { baseQuantity, checked, divide4, multiply, units } from '../../common/inventory-decimal';
import { InventoryAgeLayer } from '../inventory-age-layers/inventory-age-layer.entity';
import { InventoryAgeLayerService } from '../inventory-age-layers/inventory-age-layer.service';
import { TenantPrincipal } from '../auth/auth.types';
import { InventoryBalance } from '../inventory-balance/inventory-balance.entity';
import { InventoryBalanceService } from '../inventory-balance/inventory-balance.service';
import { InventoryLedgerService } from '../inventory-ledger/inventory-ledger.service';
import { Location } from '../locations/locations.entity';
import { NumberSequenceKeys } from '../number-sequences/number-sequence-keys';
import { formatInventoryConversionNumber } from '../number-sequences/number-sequence-formatters';
import { NumberSequencesService } from '../number-sequences/number-sequences.service';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { Product } from '../products/products.entity';
import { CreateInventoryConversionDto, InventoryConversionLineDto, PostInventoryConversionDto, UpdateInventoryConversionDto } from './dto/inventory-conversion.dto';
import { InventoryConversionLine } from './inventory-conversion-line.entity';
import { InventoryConversion, InventoryConversionAllocationMethod } from './inventory-conversion.entity';

type OutboundPlan = {
  line: InventoryConversionLine;
  balance: InventoryBalance;
  layers: InventoryAgeLayer[];
  snapshot: ReturnType<InventoryBalanceService['adjustmentSnapshot']>;
};

type InboundPlan = {
  line: InventoryConversionLine;
  balance: InventoryBalance | null;
  allocationBasisValue: string;
  allocatedValue: string;
  snapshot: ReturnType<InventoryBalanceService['inboundValueSnapshot']>;
};

@Injectable()
export class InventoryConversionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly balances: InventoryBalanceService,
    private readonly ledgers: InventoryLedgerService,
    private readonly ageLayers: InventoryAgeLayerService,
    private readonly numberSequences: NumberSequencesService,
  ) {}

  async list(user: TenantPrincipal, filters: { page: number; limit: number; search: string; status: string; locationId?: number; allocationMethod: string; dateFrom?: string; dateTo?: string }) {
    const page = Number.isSafeInteger(filters.page) && filters.page > 0 ? filters.page : 1;
    const limit = [20, 50, 100].includes(filters.limit) ? filters.limit : 20;
    const query = this.dataSource.getRepository(InventoryConversion).createQueryBuilder('conversion')
      .leftJoinAndSelect('conversion.location', 'location')
      .leftJoin('conversion.createdByUser', 'createdByUser')
      .leftJoin('conversion.postedByUser', 'postedByUser')
      .where('conversion.tenantId = :tenantId', { tenantId: user.tenantId });
    this.applyLocationScope(query, user, 'conversion.locationId');
    if (filters.search.trim()) query.andWhere(`(LOWER(COALESCE(conversion.conversionNumber, '')) LIKE :search OR LOWER(COALESCE(conversion.remarks, '')) LIKE :search)`, { search: `%${filters.search.trim().toLowerCase()}%` });
    if (['DRAFT', 'POSTED', 'CANCELLED'].includes(filters.status.toUpperCase())) query.andWhere('conversion.status = :status', { status: filters.status.toUpperCase() });
    if (Number.isSafeInteger(filters.locationId) && Number(filters.locationId) > 0) query.andWhere('conversion.locationId = :locationId', { locationId: filters.locationId });
    if (['MANUAL_PERCENT', 'BY_EXISTING_WAVG', 'BY_WEIGHT'].includes(filters.allocationMethod.toUpperCase())) query.andWhere('conversion.allocationMethod = :allocationMethod', { allocationMethod: filters.allocationMethod.toUpperCase() });
    if (filters.dateFrom) query.andWhere('conversion.conversionDate >= :dateFrom', { dateFrom: filters.dateFrom.slice(0, 10) });
    if (filters.dateTo) query.andWhere('conversion.conversionDate <= :dateTo', { dateTo: filters.dateTo.slice(0, 10) });
    const total = await query.clone().getCount();
    const result = await query
      .addSelect(`COALESCE(NULLIF(TRIM(CONCAT_WS(' ', createdByUser.firstName, createdByUser.lastName)), ''), NULLIF(createdByUser.username, ''), createdByUser.email)`, 'createdByName')
      .addSelect(`COALESCE(NULLIF(TRIM(CONCAT_WS(' ', postedByUser.firstName, postedByUser.lastName)), ''), NULLIF(postedByUser.username, ''), postedByUser.email)`, 'postedByName')
      .addSelect(subQuery => subQuery.select('COUNT(lineCount.inventoryConversionLineId)').from(InventoryConversionLine, 'lineCount').where('lineCount.inventoryConversionId = conversion.inventoryConversionId'), 'lineCount')
      .addSelect(subQuery => subQuery.select('COUNT(avalCount.inventoryConversionLineId)').from(InventoryConversionLine, 'avalCount').where("avalCount.inventoryConversionId = conversion.inventoryConversionId AND avalCount.movementType = 'AVAL'"), 'avalLineCount')
      .addSelect(subQuery => subQuery.select('COUNT(avinCount.inventoryConversionLineId)').from(InventoryConversionLine, 'avinCount').where("avinCount.inventoryConversionId = conversion.inventoryConversionId AND avinCount.movementType = 'AVIN'"), 'avinLineCount')
      .orderBy('conversion.inventoryConversionId', 'DESC').skip((page - 1) * limit).take(limit).getRawAndEntities();
    const raw = result.raw as Array<{ createdByName?: string | null; postedByName?: string | null; lineCount?: string | number | null; avalLineCount?: string | number | null; avinLineCount?: string | number | null }>;
    const items = result.entities.map((conversion, index) => ({
      ...conversion,
      createdByName: raw[index]?.createdByName ?? null,
      postedByName: conversion.status === 'POSTED' ? raw[index]?.postedByName ?? null : null,
      lineCount: Number(raw[index]?.lineCount ?? 0),
      avalLineCount: Number(raw[index]?.avalLineCount ?? 0),
      avinLineCount: Number(raw[index]?.avinLineCount ?? 0),
    }));
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
        productId: Number(product.productId), sku: product.sku, productName: product.productName,
        baseUnit: { unitId: Number(product.baseUnit.unitId), code: product.baseUnit.code, name: product.baseUnit.name, symbol: product.baseUnit.symbol },
        productUnits: product.productUnits.map(productUnit => ({
          productUnitId: Number(productUnit.productUnitId), unitId: Number(productUnit.unitId), conversionFactor: productUnit.conversionFactor, isBaseUnit: productUnit.isBaseUnit,
          unit: { unitId: Number(productUnit.unit.unitId), code: productUnit.unit.code, name: productUnit.unit.name, symbol: productUnit.unit.symbol },
        })),
        quantityOnHand: balance?.quantityOnHand ?? '0.0000', averageCost: balance?.averageCost ?? null, hasInventoryBalance: Boolean(balance),
      };
    });
    return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async locations(user: TenantPrincipal) {
    const query = this.dataSource.getRepository(Location).createQueryBuilder('location')
      .where('location.tenantId = :tenantId AND location.isActive = true', { tenantId: user.tenantId });
    this.applyLocationScope(query, user, 'location.locationId');
    const rows = await query.orderBy('location.name', 'ASC').addOrderBy('location.locationId', 'ASC').getMany();
    return rows.map(location => ({ locationId: Number(location.locationId), code: location.code, name: location.name, isActive: location.isActive }));
  }

  async get(id: number, user: TenantPrincipal) {
    this.assertId(id);
    const conversion = await this.dataSource.getRepository(InventoryConversion).findOne({
      where: { inventoryConversionId: id, tenantId: user.tenantId },
      relations: { location: true, createdByUser: true, postedByUser: true, cancelledByUser: true },
    });
    if (!conversion) throw new NotFoundException('Inventory conversion not found.');
    await this.assertLocationAccess(this.dataSource.manager, user, Number(conversion.locationId));
    const lines = await this.dataSource.getRepository(InventoryConversionLine).find({
      where: { inventoryConversionId: id }, relations: { product: { baseUnit: true }, productUnit: { unit: true } },
      order: { movementType: 'ASC', inventoryConversionLineId: 'ASC' },
    });
    return { ...conversion, lines };
  }

  async create(dto: CreateInventoryConversionDto, user: TenantPrincipal) {
    return this.dataSource.transaction(async manager => {
      const clock = await tenantBusinessClock(manager, user.tenantId);
      await this.assertLocationAccess(manager, user, Number(dto.locationId), true);
      const repository = manager.getRepository(InventoryConversion);
      const conversion = await repository.save(repository.create({
        tenantId: user.tenantId, conversionNumber: null, locationId: Number(dto.locationId), conversionDate: clock.businessDate,
        allocationMethod: dto.allocationMethod, remarks: dto.remarks?.trim() || null, status: 'DRAFT',
        totalInputValue: null, totalOutputValue: null, valueVariance: null, createdByUserId: user.userId,
        postedByUserId: null, postedAt: null, cancelledByUserId: null, cancelledAt: null, isActive: true,
      }));
      await this.saveLines(manager, conversion, dto.lines);
      return conversion;
    });
  }

  async update(id: number, dto: UpdateInventoryConversionDto, user: TenantPrincipal) {
    return this.dataSource.transaction(async manager => {
      const conversion = await this.lock(manager, id, user.tenantId);
      await this.assertLocationAccess(manager, user, Number(conversion.locationId));
      if (conversion.status !== 'DRAFT') throw new BadRequestException('Only draft inventory conversions can be edited.');
      const locationId = Number(dto.locationId ?? conversion.locationId);
      await this.assertLocationAccess(manager, user, locationId, true);
      Object.assign(conversion, {
        locationId,
        allocationMethod: dto.allocationMethod ?? conversion.allocationMethod,
        remarks: dto.remarks === undefined ? conversion.remarks : dto.remarks?.trim() || null,
      });
      await manager.getRepository(InventoryConversion).save(conversion);
      if (dto.lines) {
        await manager.getRepository(InventoryConversionLine).delete({ inventoryConversionId: id });
        await this.saveLines(manager, conversion, dto.lines);
      } else {
        const lines = await manager.getRepository(InventoryConversionLine).findBy({ inventoryConversionId: id });
        this.assertStoredLines(lines, conversion.allocationMethod);
      }
      return conversion;
    });
  }

  async cancel(id: number, user: TenantPrincipal) {
    return this.dataSource.transaction(async manager => {
      const conversion = await this.lock(manager, id, user.tenantId);
      await this.assertLocationAccess(manager, user, Number(conversion.locationId));
      if (conversion.status !== 'DRAFT') throw new BadRequestException('Only draft inventory conversions can be cancelled.');
      Object.assign(conversion, { status: 'CANCELLED', cancelledByUserId: user.userId, cancelledAt: new Date() });
      return manager.getRepository(InventoryConversion).save(conversion);
    });
  }

  async post(id: number, dto: PostInventoryConversionDto, user: TenantPrincipal) {
    return this.dataSource.transaction(async manager => {
      const clock = await tenantBusinessClock(manager, user.tenantId);
      const conversion = await this.lock(manager, id, user.tenantId);
      await this.assertLocationAccess(manager, user, Number(conversion.locationId), true);
      if (conversion.status !== 'DRAFT') throw new BadRequestException('Only draft inventory conversions can be posted.');
      const lines = await manager.getRepository(InventoryConversionLine).createQueryBuilder('line').setLock('pessimistic_write')
        .where('line.inventoryConversionId = :id', { id }).orderBy('line.inventoryConversionLineId', 'ASC').getMany();
      this.assertStoredLines(lines, conversion.allocationMethod);

      for (const line of lines) await this.validateStoredLine(manager, conversion, line);
      const productIds = [...new Set(lines.map(line => Number(line.productId)))].sort((a, b) => a - b);
      const balances = new Map<number, InventoryBalance | null>();
      const layers = new Map<number, InventoryAgeLayer[]>();
      for (const productId of productIds) {
        await this.lockProductLocation(manager, Number(conversion.locationId), productId);
        balances.set(productId, await this.balances.lock(manager, user.tenantId, Number(conversion.locationId), productId));
        if (lines.some(line => line.movementType === 'AVAL' && Number(line.productId) === productId)) {
          const rows = await manager.getRepository(InventoryAgeLayer).createQueryBuilder('layer').setLock('pessimistic_write')
            .where('layer.tenantId = :tenantId AND layer.locationId = :locationId AND layer.productId = :productId', { tenantId: user.tenantId, locationId: conversion.locationId, productId })
            .orderBy('layer.receiptDate', 'ASC').addOrderBy('layer.inventoryAgeLayerId', 'ASC').getMany();
          layers.set(productId, rows);
        }
      }

      const outboundPlans: OutboundPlan[] = lines.filter(line => line.movementType === 'AVAL').map(line => {
        const balance = balances.get(Number(line.productId));
        if (!balance || balance.averageCost == null || units(balance.averageCost) <= 0n)
          throw new BadRequestException('Current WAVG is not available for an AVAL product/location.');
        return {
          line, balance, layers: layers.get(Number(line.productId)) ?? [],
          snapshot: this.balances.adjustmentSnapshot(balance, line.baseQuantity, checked(units(balance.averageCost)), 'OUT'),
        };
      });
      if (outboundPlans.some(plan => plan.snapshot.createsNegativeStock) && dto.confirmNegativeStock !== true)
        throw new BadRequestException('This conversion will create negative stock. Explicitly confirm negative stock to post.');
      const totalInput = outboundPlans.reduce((sum, plan) => sum + units(plan.snapshot.movementValue), 0n);
      if (totalInput <= 0n) throw new BadRequestException('Total AVAL posted value must be greater than zero.');

      const inboundPlans = this.planInbound(conversion.allocationMethod, lines.filter(line => line.movementType === 'AVIN'), balances, totalInput);
      const totalOutput = inboundPlans.reduce((sum, plan) => sum + units(plan.allocatedValue), 0n);
      if (totalOutput !== totalInput) throw new BadRequestException('AVIN allocated value does not reconcile to total AVAL posted value.');

      const year = clock.businessDate.slice(0, 4);
      const nextNumber = await this.numberSequences.getTenantNextNumber(manager, user.tenantId, NumberSequenceKeys.INVENTORY_CONVERSION, year);
      conversion.conversionNumber = formatInventoryConversionNumber(user.tenantId, year, nextNumber);

      for (const plan of outboundPlans) {
        await this.balances.applyAdjustment(manager, plan.balance, { tenantId: user.tenantId, locationId: Number(conversion.locationId), productId: Number(plan.line.productId) }, plan.snapshot, clock.now);
        const ageLayerRelief = await this.ageLayers.relieve(manager, plan.layers, { quantity: plan.line.baseQuantity });
        await this.ledgers.insert(manager, {
          tenantId: user.tenantId, locationId: Number(conversion.locationId), productId: Number(plan.line.productId), movementDate: clock.now, businessDate: clock.businessDate,
          movementType: 'AVAL', sourceDocumentType: 'INVENTORY_CONVERSION', sourceDocumentId: conversion.inventoryConversionId, sourceDocumentLineId: plan.line.inventoryConversionLineId,
          quantityIn: '0.0000', quantityOut: plan.line.baseQuantity, unitCost: plan.snapshot.averageCostBefore, movementValue: plan.snapshot.movementValue,
          quantityBefore: plan.snapshot.quantityBefore, quantityAfter: plan.snapshot.quantityAfter, averageCostBefore: plan.snapshot.averageCostBefore, averageCostAfter: plan.snapshot.averageCostAfter,
          valuationMethod: 'CURRENT_WAVG', originalDocumentValue: plan.snapshot.movementValue, inventoryReliefValue: plan.snapshot.movementValue, costVariance: '0.0000',
          reversalOfLedgerId: null, inventoryAdjustmentReasonId: null, ageLayerRelief, createdByUserId: user.userId,
        });
        Object.assign(plan.line, {
          quantityBefore: plan.snapshot.quantityBefore, quantityAfter: plan.snapshot.quantityAfter, wavgBefore: plan.snapshot.averageCostBefore,
          wavgAfter: plan.snapshot.averageCostAfter, postedUnitCost: plan.snapshot.averageCostBefore, postedValue: plan.snapshot.movementValue,
          allocationBasisValue: null, allocatedValue: null,
        });
        await manager.getRepository(InventoryConversionLine).save(plan.line);
      }

      for (const plan of inboundPlans) {
        await this.balances.applyAdjustment(manager, plan.balance, { tenantId: user.tenantId, locationId: Number(conversion.locationId), productId: Number(plan.line.productId) }, plan.snapshot, clock.now);
        await this.ledgers.insert(manager, {
          tenantId: user.tenantId, locationId: Number(conversion.locationId), productId: Number(plan.line.productId), movementDate: clock.now, businessDate: clock.businessDate,
          movementType: 'AVIN', sourceDocumentType: 'INVENTORY_CONVERSION', sourceDocumentId: conversion.inventoryConversionId, sourceDocumentLineId: plan.line.inventoryConversionLineId,
          quantityIn: plan.line.baseQuantity, quantityOut: '0.0000', unitCost: plan.snapshot.unitCost, movementValue: plan.allocatedValue,
          quantityBefore: plan.snapshot.quantityBefore, quantityAfter: plan.snapshot.quantityAfter, averageCostBefore: plan.snapshot.averageCostBefore, averageCostAfter: plan.snapshot.averageCostAfter,
          valuationMethod: conversion.allocationMethod, originalDocumentValue: plan.allocatedValue, inventoryReliefValue: plan.allocatedValue, costVariance: '0.0000',
          reversalOfLedgerId: null, inventoryAdjustmentReasonId: null, ageLayerRelief: null, createdByUserId: user.userId,
        });
        await this.ageLayers.insert(manager, {
          tenantId: user.tenantId, locationId: Number(conversion.locationId), productId: Number(plan.line.productId), sourceDocumentType: 'INVENTORY_CONVERSION',
          sourceDocumentId: conversion.inventoryConversionId, sourceDocumentLineId: plan.line.inventoryConversionLineId, receiptDate: clock.businessDate,
          originalQuantity: plan.line.baseQuantity, remainingQuantity: plan.line.baseQuantity, originalUnitCost: plan.snapshot.unitCost,
          batchNumber: null, manufactureDate: null, expiryDate: null, isActive: true,
        });
        Object.assign(plan.line, {
          quantityBefore: plan.snapshot.quantityBefore, quantityAfter: plan.snapshot.quantityAfter, wavgBefore: plan.snapshot.averageCostBefore,
          wavgAfter: plan.snapshot.averageCostAfter, postedUnitCost: plan.snapshot.unitCost, postedValue: plan.allocatedValue,
          allocationBasisValue: plan.allocationBasisValue, allocatedValue: plan.allocatedValue,
        });
        await manager.getRepository(InventoryConversionLine).save(plan.line);
      }

      Object.assign(conversion, {
        status: 'POSTED', postedByUserId: user.userId, postedAt: clock.now,
        totalInputValue: checked(totalInput), totalOutputValue: checked(totalOutput), valueVariance: checked(totalOutput - totalInput),
      });
      return manager.getRepository(InventoryConversion).save(conversion);
    });
  }

  private planInbound(method: InventoryConversionAllocationMethod, lines: InventoryConversionLine[], balances: Map<number, InventoryBalance | null>, totalInput: bigint): InboundPlan[] {
    const bases = lines.map(line => {
      if (method === 'MANUAL_PERCENT') return units(line.allocationPercent!);
      if (method === 'BY_WEIGHT') return units(line.allocationWeight!);
      const balance = balances.get(Number(line.productId));
      if (!balance || balance.averageCost == null || units(balance.averageCost) <= 0n)
        throw new BadRequestException('Current WAVG is required for every AVIN line when allocation method is BY_EXISTING_WAVG.');
      return multiply(units(line.baseQuantity), units(balance.averageCost));
    });
    if (method === 'MANUAL_PERCENT' && this.abs(bases.reduce((sum, value) => sum + value, 0n) - units('100')) > 1n)
      throw new BadRequestException('AVIN allocation percentages must total 100%.');
    if (bases.some(value => value <= 0n)) throw new BadRequestException('Every AVIN allocation basis must be greater than zero.');
    const allocated = this.allocate(totalInput, bases);
    return lines.map((line, index) => {
      if (allocated[index] <= 0n) throw new BadRequestException('Every AVIN line must receive a positive allocated value.');
      const balance = balances.get(Number(line.productId)) ?? null;
      const allocatedValue = checked(allocated[index]);
      return {
        line, balance, allocatedValue, allocationBasisValue: checked(bases[index]),
        snapshot: this.balances.inboundValueSnapshot(balance, line.baseQuantity, allocatedValue),
      };
    });
  }

  private allocate(total: bigint, bases: bigint[]) {
    const denominator = bases.reduce((sum, value) => sum + value, 0n);
    if (denominator <= 0n) throw new BadRequestException('Total AVIN allocation basis must be greater than zero.');
    let assigned = 0n;
    return bases.map((basis, index) => {
      const value = index === bases.length - 1 ? total - assigned : this.roundDivide(total * basis, denominator);
      assigned += value;
      return value;
    });
  }

  private async saveLines(manager: EntityManager, conversion: InventoryConversion, rows: InventoryConversionLineDto[]) {
    this.assertInputLines(rows, conversion.allocationMethod);
    for (const row of rows) {
      const productId = Number(row.productId), productUnitId = Number(row.productUnitId);
      const { productUnit } = await this.validateProductUnit(manager, conversion.tenantId, Number(conversion.locationId), productId, productUnitId);
      const quantity = checked(units(row.quantity));
      const converted = baseQuantity(quantity, productUnit.conversionFactor);
      if (units(quantity) <= 0n || units(converted) <= 0n) throw new BadRequestException('Conversion line quantities must be greater than zero.');
      const repository = manager.getRepository(InventoryConversionLine);
      await repository.save(repository.create({
        inventoryConversionId: conversion.inventoryConversionId, movementType: row.movementType, productId, productUnitId,
        conversionFactorSnapshot: String(productUnit.conversionFactor), quantity, baseQuantity: converted,
        quantityBefore: null, quantityAfter: null, wavgBefore: null, wavgAfter: null, postedUnitCost: null, postedValue: null,
        allocationPercent: row.movementType === 'AVIN' && conversion.allocationMethod === 'MANUAL_PERCENT' ? checked(units(row.allocationPercent!)) : null,
        allocationBasisValue: null, allocatedValue: null,
        allocationWeight: row.movementType === 'AVIN' && conversion.allocationMethod === 'BY_WEIGHT' ? checked(units(row.allocationWeight!)) : null,
        remarks: row.remarks?.trim() || null,
      }));
    }
  }

  private assertInputLines(rows: InventoryConversionLineDto[], method: InventoryConversionAllocationMethod) {
    if (!Array.isArray(rows) || !rows.length) throw new BadRequestException('Inventory conversion lines are required.');
    const aval = rows.filter(line => line.movementType === 'AVAL');
    const avin = rows.filter(line => line.movementType === 'AVIN');
    if (!aval.length || !avin.length) throw new BadRequestException('At least one AVAL line and one AVIN line are required.');
    const sideProducts = new Set<string>(), inputs = new Set<number>();
    for (const row of rows) {
      const key = `${row.movementType}:${Number(row.productId)}`;
      if (sideProducts.has(key)) throw new BadRequestException('A product can appear only once on each conversion side.');
      sideProducts.add(key);
      if (row.movementType === 'AVAL') inputs.add(Number(row.productId));
    }
    if (avin.some(row => inputs.has(Number(row.productId)))) throw new BadRequestException('A product cannot appear on both AVAL and AVIN sides.');
    for (const row of rows) {
      if (row.movementType === 'AVAL' && (row.allocationPercent !== undefined || row.allocationWeight !== undefined)) throw new BadRequestException('AVAL lines cannot contain allocation fields.');
      if (row.movementType === 'AVIN') {
        if (method === 'MANUAL_PERCENT' && row.allocationPercent === undefined) throw new BadRequestException('Every AVIN line requires an allocation percentage.');
        if (method === 'BY_WEIGHT' && row.allocationWeight === undefined) throw new BadRequestException('Every AVIN line requires an allocation weight.');
        if (method !== 'MANUAL_PERCENT' && row.allocationPercent !== undefined) throw new BadRequestException('Allocation percentage is only valid for MANUAL_PERCENT.');
        if (method !== 'BY_WEIGHT' && row.allocationWeight !== undefined) throw new BadRequestException('Allocation weight is only valid for BY_WEIGHT.');
      }
    }
    if (method === 'MANUAL_PERCENT') {
      const total = avin.reduce((sum, row) => sum + units(row.allocationPercent!), 0n);
      if (this.abs(total - units('100')) > 1n) throw new BadRequestException('AVIN allocation percentages must total 100%.');
    }
  }

  private assertStoredLines(lines: InventoryConversionLine[], method: InventoryConversionAllocationMethod) {
    this.assertInputLines(lines.map(line => ({
      movementType: line.movementType, productId: Number(line.productId), productUnitId: Number(line.productUnitId), quantity: line.quantity,
      allocationPercent: line.allocationPercent ?? undefined, allocationWeight: line.allocationWeight ?? undefined, remarks: line.remarks ?? undefined,
    })), method);
    if (lines.some(line => units(line.quantity) <= 0n || units(line.baseQuantity) <= 0n)) throw new BadRequestException('Conversion line quantities must be greater than zero.');
  }

  private async validateStoredLine(manager: EntityManager, conversion: InventoryConversion, line: InventoryConversionLine) {
    const { productUnit } = await this.validateProductUnit(manager, conversion.tenantId, Number(conversion.locationId), Number(line.productId), Number(line.productUnitId));
    if (String(productUnit.conversionFactor) !== String(line.conversionFactorSnapshot) || baseQuantity(line.quantity, line.conversionFactorSnapshot) !== checked(units(line.baseQuantity)))
      throw new BadRequestException('Conversion line product-unit conversion snapshot is invalid or has changed; edit the draft before posting.');
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

  private async lockProductLocation(manager: EntityManager, locationId: number, productId: number) {
    const row = await manager.getRepository(ProductLocation).createQueryBuilder('productLocation').setLock('pessimistic_write')
      .where('productLocation.productId = :productId AND productLocation.locationId = :locationId AND productLocation.isActive = true', { productId, locationId }).getOne();
    if (!row) throw new BadRequestException('Product location is not configured for inventory posting.');
  }

  private async assertLocationAccess(manager: EntityManager, user: TenantPrincipal, locationId: number, requireActive = false) {
    if (user.accessScope === 'LOCATION' && !user.assignedLocationIds.map(Number).includes(locationId)) throw new ForbiddenException('User is not assigned to this location.');
    const location = await manager.getRepository(Location).findOneBy({ locationId, tenantId: user.tenantId, ...(requireActive ? { isActive: true } : {}) });
    if (!location) throw new NotFoundException('Location not found.');
  }

  private applyLocationScope(query: { andWhere(sql: string, parameters?: object): unknown }, user: TenantPrincipal, field: string) {
    if (user.accessScope !== 'LOCATION') return;
    if (!user.assignedLocationIds.length) query.andWhere('1 = 0');
    else query.andWhere(`${field} IN (:...locationIds)`, { locationIds: user.assignedLocationIds.map(Number) });
  }

  private async lock(manager: EntityManager, id: number, tenantId: number) {
    this.assertId(id);
    const conversion = await manager.getRepository(InventoryConversion).createQueryBuilder('conversion').setLock('pessimistic_write')
      .where('conversion.inventoryConversionId = :id AND conversion.tenantId = :tenantId', { id, tenantId }).getOne();
    if (!conversion) throw new NotFoundException('Inventory conversion not found.');
    return conversion;
  }

  private assertId(id: number) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new BadRequestException('Invalid inventory conversion ID.');
  }

  private abs(value: bigint) { return value < 0n ? -value : value; }
  private roundDivide(numerator: bigint, denominator: bigint) { return (numerator + denominator / 2n) / denominator; }
}
