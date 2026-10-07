import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager, In } from 'typeorm';
import { tenantBusinessClock } from '../../common/business-date';
import { checked, multiply, units } from '../../common/inventory-decimal';
import { TenantPrincipal } from '../auth/auth.types';
import { InventoryAgingService } from '../inventory-aging/inventory-aging.service';
import { InventoryBalance } from '../inventory-balance/inventory-balance.entity';
import { InventoryBalanceService } from '../inventory-balance/inventory-balance.service';
import { InventoryLedger } from '../inventory-ledger/inventory-ledger.entity';
import { Location } from '../locations/locations.entity';
import { NumberSequenceKeys } from '../number-sequences/number-sequence-keys';
import { formatStockTransferNumber } from '../number-sequences/number-sequence-formatters';
import { NumberSequencesService } from '../number-sequences/number-sequences.service';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { Product } from '../products/products.entity';
import { CreateStockTransferDto, DispatchStockTransferDto, ReceiveStockTransferDto } from './dto/stock-transfer.dto';
import { StockTransferAgeAllocation } from './stock-transfer-age-allocation.entity';
import { StockTransferLine } from './stock-transfer-line.entity';
import { StockTransferReceiptLine } from './stock-transfer-receipt-line.entity';
import { StockTransferReceipt } from './stock-transfer-receipt.entity';
import { StockTransfer } from './stock-transfer.entity';
import { allocateDispatchAge, allocateReceiptAge } from './stock-transfer-aging';

@Injectable()
export class StockTransfersService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly balances: InventoryBalanceService,
    private readonly aging: InventoryAgingService,
    private readonly sequences: NumberSequencesService,
  ) {}

  private assertLocations(transfer: Pick<StockTransfer, 'sourceLocationId' | 'destinationLocationId'>, user: TenantPrincipal) {
    if (user.accessScope === 'LOCATION' && [transfer.sourceLocationId, transfer.destinationLocationId].some(id => !user.assignedLocationIds.map(Number).includes(Number(id))))
      throw new ForbiddenException('Both transfer locations must be in your assigned scope.');
  }

  private fingerprint(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

  private uniqueKeyConflict(error: unknown, index: string) {
    const candidate = error as { code?: string; driverError?: { code?: string; sqlMessage?: string } };
    return (candidate.driverError?.code ?? candidate.code) === 'ER_DUP_ENTRY' && (candidate.driverError?.sqlMessage ?? '').includes(index);
  }

  private positiveQuantity(value: string) {
    if (typeof value !== 'string' || !/^\d+(?:\.\d{1,4})?$/.test(value) || units(value) <= 0n)
      throw new BadRequestException('Quantity must be positive with at most four decimal places.');
    return units(value);
  }

  private async load(manager: EntityManager, id: number, user: TenantPrincipal) {
    const transfer = await manager.getRepository(StockTransfer).findOneBy({ stockTransferId: id, tenantId: user.tenantId });
    if (!transfer) throw new NotFoundException('Stock transfer not found.');
    this.assertLocations(transfer, user);
    const lines = await manager.getRepository(StockTransferLine).find({ where: { stockTransferId: id }, order: { lineNumber: 'ASC' } });
    const ids = lines.map(line => Number(line.stockTransferLineId));
    const allocations = ids.length ? await manager.getRepository(StockTransferAgeAllocation).findBy({ stockTransferLineId: In(ids) }) : [];
    return { ...transfer, lines: lines.map(line => {
      const inTransit = units(line.dispatchedQuantity) - units(line.receivedQuantity);
      return { ...line, inTransitQuantity: checked(inTransit), inTransitValue: line.unitCostSnapshot === null ? null : checked(multiply(inTransit, units(line.unitCostSnapshot))),
        ageAllocations: allocations.filter(row => Number(row.stockTransferLineId) === Number(line.stockTransferLineId)) };
    }) };
  }

  get(id: number, user: TenantPrincipal) { return this.load(this.dataSource.manager, id, user); }

  async list(user: TenantPrincipal) {
    const query = this.dataSource.getRepository(StockTransfer).createQueryBuilder('transfer').where('transfer.tenantId = :tenantId', { tenantId: user.tenantId });
    if (user.accessScope === 'LOCATION') {
      const ids = user.assignedLocationIds.length ? user.assignedLocationIds : [-1];
      query.andWhere('transfer.sourceLocationId IN (:...ids) AND transfer.destinationLocationId IN (:...ids)', { ids });
    }
    return query.orderBy('transfer.stockTransferId', 'DESC').take(100).getMany();
  }

  async create(dto: CreateStockTransferDto, user: TenantPrincipal) {
    if (dto.sourceLocationId === dto.destinationLocationId) throw new BadRequestException('Source and destination must be different locations.');
    if (new Set(dto.lines.map(line => Number(line.productId))).size !== dto.lines.length) throw new BadRequestException('A product may appear only once per transfer.');
    this.assertLocations(dto, user);
    return this.dataSource.transaction(async manager => {
      const locations = await manager.getRepository(Location).findBy({ locationId: In([dto.sourceLocationId, dto.destinationLocationId]), tenantId: user.tenantId, isActive: true });
      if (locations.length !== 2) throw new BadRequestException('Both transfer locations must be active and belong to this tenant.');
      const clock = await tenantBusinessClock(manager, user.tenantId);
      const number = await this.sequences.getTenantNextNumber(manager, user.tenantId, NumberSequenceKeys.STOCK_TRANSFER, clock.businessDate.slice(0, 4));
      const transfer = await manager.getRepository(StockTransfer).save(manager.getRepository(StockTransfer).create({
        tenantId: user.tenantId, transferNumber: formatStockTransferNumber(user.tenantId, clock.businessDate.slice(0, 4), number),
        sourceLocationId: dto.sourceLocationId, destinationLocationId: dto.destinationLocationId, status: 'DRAFT', transferDate: clock.businessDate,
        dispatchBusinessDate: null, receiptCompletedBusinessDate: null, dispatchedAt: null, dispatchedByUserId: null,
        receivedCompletedAt: null, receivedCompletedByUserId: null, dispatchKey: null, dispatchFingerprint: null,
        dispatchReference: dto.dispatchReference?.trim() || null, carrierReference: dto.carrierReference?.trim() || null,
        trackingReference: dto.trackingReference?.trim() || null, vehicleReference: dto.vehicleReference?.trim() || null,
        expectedArrivalDate: dto.expectedArrivalDate ?? null, remarks: dto.remarks?.trim() || null,
        createdByUserId: user.userId, cancelledAt: null, cancelledByUserId: null,
      }));
      for (const [index, input] of dto.lines.entries()) {
        const quantity = this.positiveQuantity(input.quantity);
        const product = await manager.getRepository(Product).findOneBy({ productId: input.productId, tenantId: user.tenantId, isActive: true, isStockItem: true });
        if (!product) throw new BadRequestException('Transfer product must be an active stock item in this tenant.');
        for (const locationId of [dto.sourceLocationId, dto.destinationLocationId]) {
          if (!await manager.getRepository(ProductLocation).findOneBy({ productId: input.productId, locationId, isActive: true }))
            throw new BadRequestException(`Product ${input.productId} is not active at location ${locationId}.`);
        }
        await manager.getRepository(StockTransferLine).save(manager.getRepository(StockTransferLine).create({
          stockTransferId: transfer.stockTransferId, lineNumber: index + 1, productId: input.productId,
          unitId: product.baseUnitId, requestedQuantity: checked(quantity), dispatchedQuantity: '0.0000',
          receivedQuantity: '0.0000', unitCostSnapshot: null, transferValue: null,
        }));
      }
      return this.load(manager, transfer.stockTransferId, user);
    });
  }

  async dispatch(id: number, dto: DispatchStockTransferDto, user: TenantPrincipal) {
    if (!dto.dispatchKey) throw new BadRequestException('Dispatch key is required.');
    try {
    return await this.dataSource.transaction('READ COMMITTED', async manager => {
      const repo = manager.getRepository(StockTransfer);
      const transfer = await repo.findOne({ where: { stockTransferId: id, tenantId: user.tenantId }, lock: { mode: 'pessimistic_write' } });
      if (!transfer) throw new NotFoundException('Stock transfer not found.');
      this.assertLocations(transfer, user);
      const lines = await manager.getRepository(StockTransferLine).findBy({ stockTransferId: id });
      const fingerprint = this.fingerprint({ transferId: Number(id), lines: lines.map(line => [Number(line.stockTransferLineId), line.requestedQuantity]).sort((a, b) => Number(a[0]) - Number(b[0])) });
      if (transfer.status !== 'DRAFT') {
        if (transfer.dispatchKey === dto.dispatchKey && transfer.dispatchFingerprint === fingerprint && transfer.status !== 'CANCELLED') return this.load(manager, id, user);
        throw new ConflictException('Transfer is no longer a dispatchable draft or dispatch key differs.');
      }
      if (await repo.findOneBy({ tenantId: user.tenantId, dispatchKey: dto.dispatchKey })) throw new ConflictException('Dispatch key was already used.');
      if (!lines.length) throw new BadRequestException('Transfer has no lines.');
      const clock = await tenantBusinessClock(manager, user.tenantId);
      const ordered = [...lines].sort((a, b) => Number(a.productId) - Number(b.productId));
      const locked = new Map<number, InventoryBalance>();
      for (const line of ordered) {
        const balance = await this.balances.lock(manager, user.tenantId, transfer.sourceLocationId, line.productId);
        if (!balance || units(balance.quantityOnHand) < units(line.requestedQuantity)) throw new BadRequestException(`Insufficient source stock for product ${line.productId}.`);
        locked.set(Number(line.productId), balance);
      }
      const sourceAging = await this.aging.calculateCurrentAging(user, { locationId: Number(transfer.sourceLocationId) }, manager);
      const ages = new Map(sourceAging.rows.map(row => [row.productId, row]));
      for (const line of ordered) {
        const balance = locked.get(Number(line.productId))!;
        const aging = ages.get(Number(line.productId));
        if (!aging) throw new ConflictException('Source stock has no aging reconciliation row.');
        const quantity = units(line.requestedQuantity);
        const cost = checked(units(balance.averageCost));
        if (units(cost) < 0n) throw new ConflictException('Source WAVG cannot be negative.');
        const value = checked(multiply(quantity, units(cost)));
        const before = units(balance.quantityOnHand);
        const after = before - quantity;
        for (const allocated of allocateDispatchAge(aging, line.requestedQuantity)) {
          await manager.getRepository(StockTransferAgeAllocation).save(manager.getRepository(StockTransferAgeAllocation).create({
            stockTransferLineId: line.stockTransferLineId, originAgingDate: allocated.originAgingDate,
            dispatchedQuantity: allocated.dispatchedQuantity, receivedQuantity: '0.0000',
          }));
        }
        line.dispatchedQuantity = line.requestedQuantity;
        line.unitCostSnapshot = cost;
        line.transferValue = value;
        await manager.getRepository(StockTransferLine).save(line);
        balance.quantityOnHand = checked(after);
        balance.lastMovementAt = clock.now;
        await manager.getRepository(InventoryBalance).save(balance);
        await manager.getRepository(InventoryLedger).save(manager.getRepository(InventoryLedger).create({
          tenantId: user.tenantId, locationId: transfer.sourceLocationId, productId: line.productId,
          movementDate: clock.now, businessDate: clock.businessDate, movementType: 'TRANSFER_OUT',
          sourceDocumentType: 'STOCK_TRANSFER', sourceDocumentId: id, sourceDocumentLineId: line.stockTransferLineId,
          quantityIn: '0.0000', quantityOut: checked(quantity), unitCost: cost, movementValue: value,
          quantityBefore: checked(before), quantityAfter: checked(after), averageCostBefore: cost, averageCostAfter: cost,
          createdByUserId: user.userId,
        }));
      }
      Object.assign(transfer, { status: 'DISPATCHED', dispatchBusinessDate: clock.businessDate, dispatchedAt: clock.now,
        dispatchedByUserId: user.userId, dispatchKey: dto.dispatchKey, dispatchFingerprint: fingerprint });
      await repo.save(transfer);
      return this.load(manager, id, user);
    });
    } catch (error) {
      if (this.uniqueKeyConflict(error, 'uq_stock_transfer_dispatch_key')) throw new ConflictException('Dispatch key was already used.');
      throw error;
    }
  }

  async receive(id: number, dto: ReceiveStockTransferDto, user: TenantPrincipal) {
    if (!dto.receiptKey) throw new BadRequestException('Receipt key is required.');
    if (new Set(dto.lines.map(line => Number(line.stockTransferLineId))).size !== dto.lines.length) throw new BadRequestException('A transfer line may appear only once per receipt.');
    const normalized = dto.lines.map(line => [Number(line.stockTransferLineId), checked(this.positiveQuantity(line.quantity))]).sort((a, b) => Number(a[0]) - Number(b[0]));
    const fingerprint = this.fingerprint({ transferId: Number(id), lines: normalized });
    try {
    return await this.dataSource.transaction('READ COMMITTED', async manager => {
      const receiptRepo = manager.getRepository(StockTransferReceipt);
      const prior = await receiptRepo.findOneBy({ tenantId: user.tenantId, receiptKey: dto.receiptKey });
      if (prior) {
        if (Number(prior.stockTransferId) !== Number(id) || prior.requestFingerprint !== fingerprint) throw new ConflictException('Receipt key was already used for different data.');
        this.assertLocations(await manager.getRepository(StockTransfer).findOneByOrFail({ stockTransferId: id, tenantId: user.tenantId }), user);
        if (!prior.resultSnapshot) throw new ConflictException('Committed receipt has no response snapshot.');
        return prior.resultSnapshot;
      }
      const transfer = await manager.getRepository(StockTransfer).findOne({ where: { stockTransferId: id, tenantId: user.tenantId }, lock: { mode: 'pessimistic_write' } });
      if (!transfer) throw new NotFoundException('Stock transfer not found.');
      this.assertLocations(transfer, user);
      const committed = await receiptRepo.findOneBy({ tenantId: user.tenantId, receiptKey: dto.receiptKey });
      if (committed) {
        if (Number(committed.stockTransferId) !== Number(id) || committed.requestFingerprint !== fingerprint) throw new ConflictException('Receipt key was already used for different data.');
        if (!committed.resultSnapshot) throw new ConflictException('Committed receipt has no response snapshot.');
        return committed.resultSnapshot;
      }
      if (!['DISPATCHED', 'PART_RECEIVED'].includes(transfer.status)) throw new ConflictException('Transfer is not awaiting receipt.');
      const lines = await manager.getRepository(StockTransferLine).findBy({ stockTransferId: id });
      const requests = dto.lines.map(input => {
        const line = lines.find(row => Number(row.stockTransferLineId) === Number(input.stockTransferLineId));
        if (!line) throw new BadRequestException('Receipt line does not belong to this transfer.');
        const quantity = this.positiveQuantity(input.quantity);
        if (quantity <= 0n || quantity > units(line.dispatchedQuantity) - units(line.receivedQuantity)) throw new BadRequestException('Receipt exceeds remaining in-transit quantity.');
        if (line.unitCostSnapshot === null || line.transferValue === null) throw new ConflictException('Transfer line has no dispatched cost snapshot.');
        return { line, quantity };
      }).sort((a, b) => Number(a.line.productId) - Number(b.line.productId));
      const clock = await tenantBusinessClock(manager, user.tenantId);
      const receipt = await receiptRepo.save(receiptRepo.create({ tenantId: user.tenantId, stockTransferId: id,
        receiptKey: dto.receiptKey, requestFingerprint: fingerprint, receivedBusinessDate: clock.businessDate,
        receivedAt: clock.now, receivedByUserId: user.userId }));
      const ids = requests.map(request => Number(request.line.stockTransferLineId));
      const allocations = await manager.getRepository(StockTransferAgeAllocation).findBy({ stockTransferLineId: In(ids) });
      const placeholders = ids.map(() => '?').join(',');
      const priorValues: Array<{ stock_transfer_line_id: string; received_value: string }> = await manager.query(
        `SELECT stock_transfer_line_id, SUM(received_value) AS received_value FROM tbl_stock_transfer_receipt_line WHERE stock_transfer_line_id IN (${placeholders}) GROUP BY stock_transfer_line_id`, ids);
      const priorValueByLine = new Map(priorValues.map(row => [Number(row.stock_transfer_line_id), units(row.received_value)]));
      for (const request of requests) {
        const line = request.line;
        await manager.query(`INSERT INTO tbl_inventory_balance (tenant_id, location_id, product_id, quantity_on_hand, average_cost, created_at)
          VALUES (?, ?, ?, 0, 0, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE inventory_balance_id = inventory_balance_id`,
          [user.tenantId, transfer.destinationLocationId, line.productId]);
        const balance = (await this.balances.lock(manager, user.tenantId, transfer.destinationLocationId, line.productId))!;
        const isFinal = request.quantity === units(line.dispatchedQuantity) - units(line.receivedQuantity);
        const receivedValue = isFinal
          ? checked(units(line.transferValue!) - (priorValueByLine.get(Number(line.stockTransferLineId)) ?? 0n))
          : checked(multiply(request.quantity, units(line.unitCostSnapshot!)));
        const movement = this.balances.inboundValueSnapshot(balance, checked(request.quantity), receivedValue);
        balance.quantityOnHand = movement.quantityAfter;
        balance.averageCost = movement.averageCostAfter;
        balance.lastMovementAt = clock.now;
        await manager.getRepository(InventoryBalance).save(balance);
        const detail = await manager.getRepository(StockTransferReceiptLine).save(manager.getRepository(StockTransferReceiptLine).create({
          stockTransferReceiptId: receipt.stockTransferReceiptId, stockTransferLineId: line.stockTransferLineId,
          receivedQuantity: checked(request.quantity), receivedValue,
        }));
        for (const change of allocateReceiptAge(allocations.filter(row => Number(row.stockTransferLineId) === Number(line.stockTransferLineId)), checked(request.quantity))) {
          change.allocation.receivedQuantity = change.receivedQuantity;
          await manager.getRepository(StockTransferAgeAllocation).save(change.allocation);
        }
        line.receivedQuantity = checked(units(line.receivedQuantity) + request.quantity);
        await manager.getRepository(StockTransferLine).save(line);
        await manager.getRepository(InventoryLedger).save(manager.getRepository(InventoryLedger).create({
          tenantId: user.tenantId, locationId: transfer.destinationLocationId, productId: line.productId,
          movementDate: clock.now, businessDate: clock.businessDate, movementType: 'TRANSFER_IN',
          sourceDocumentType: 'STOCK_TRANSFER_RECEIPT', sourceDocumentId: receipt.stockTransferReceiptId,
          sourceDocumentLineId: detail.stockTransferReceiptLineId,
          quantityIn: checked(request.quantity), quantityOut: '0.0000', unitCost: line.unitCostSnapshot!, movementValue: receivedValue,
          quantityBefore: movement.quantityBefore, quantityAfter: movement.quantityAfter,
          averageCostBefore: movement.averageCostBefore, averageCostAfter: movement.averageCostAfter,
          createdByUserId: user.userId,
        }));
      }
      const complete = lines.every(line => units(line.receivedQuantity) === units(line.dispatchedQuantity));
      transfer.status = complete ? 'RECEIVED' : 'PART_RECEIVED';
      if (complete) { transfer.receiptCompletedBusinessDate = clock.businessDate; transfer.receivedCompletedAt = clock.now; transfer.receivedCompletedByUserId = user.userId; }
      await manager.getRepository(StockTransfer).save(transfer);
      const result = { receiptId: receipt.stockTransferReceiptId, transfer: await this.load(manager, id, user) };
      receipt.resultSnapshot = result;
      await receiptRepo.save(receipt);
      return result;
    });
    } catch (error) {
      if (!this.uniqueKeyConflict(error, 'uq_stock_transfer_receipt_key')) throw error;
      const committed = await this.dataSource.getRepository(StockTransferReceipt).findOneBy({ tenantId: user.tenantId, receiptKey: dto.receiptKey });
      if (!committed) throw error;
      if (Number(committed.stockTransferId) !== Number(id) || committed.requestFingerprint !== fingerprint) throw new ConflictException('Receipt key was already used for different data.');
      await this.load(this.dataSource.manager, id, user);
      if (!committed.resultSnapshot) throw new ConflictException('Committed receipt has no response snapshot.');
      return committed.resultSnapshot;
    }
  }

  async cancel(id: number, user: TenantPrincipal) {
    return this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(StockTransfer);
      const transfer = await repo.findOne({ where: { stockTransferId: id, tenantId: user.tenantId }, lock: { mode: 'pessimistic_write' } });
      if (!transfer) throw new NotFoundException('Stock transfer not found.');
      this.assertLocations(transfer, user);
      if (transfer.status !== 'DRAFT') throw new ConflictException('Only an undispatched draft can be cancelled.');
      transfer.status = 'CANCELLED'; transfer.cancelledAt = new Date(); transfer.cancelledByUserId = user.userId;
      await repo.save(transfer);
      return this.load(manager, id, user);
    });
  }
}
