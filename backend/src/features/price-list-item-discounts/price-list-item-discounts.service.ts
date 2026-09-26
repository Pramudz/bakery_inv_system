import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PriceListItem } from '../price-list-items/price-list-items.entity';
import { Product } from '../products/products.entity';
import { ChangePriceListItemDiscountDto, EndPriceListItemDiscountDto, PublishPriceListItemDiscountDto, ResolveSellingPriceDto } from './dto/price-list-item-discount.dto';
import { discountBreakdown, decimal4, format4 } from './discount-money';
import { PriceListItemDiscount, PriceListItemDiscountType } from './price-list-item-discounts.entity';

type DiscountInput = PublishPriceListItemDiscountDto | ChangePriceListItemDiscountDto;

function validDate(value: string, field: string) {
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) throw new BadRequestException(`${field} must be a valid date and time.`);
  return result;
}

export function discountStatus(row: Pick<PriceListItemDiscount, 'isActive' | 'effectiveFrom' | 'effectiveTo'>, at = new Date()) {
  if (!row.isActive || (row.effectiveTo && row.effectiveTo < at)) return 'ENDED' as const;
  if (row.effectiveFrom > at) return 'FUTURE' as const;
  return 'CURRENT' as const;
}

async function lockedParent(manager: EntityManager, priceListItemId: number, tenantId: number) {
  const parent = await manager.getRepository(PriceListItem).createQueryBuilder('price')
    .setLock('pessimistic_write')
    .leftJoinAndSelect('price.priceList', 'priceList')
    .leftJoinAndSelect('price.productUnit', 'productUnit')
    .leftJoinAndSelect('productUnit.unit', 'unit')
    .where('price.priceListItemId = :priceListItemId AND price.tenantId = :tenantId', { priceListItemId, tenantId })
    .getOne();
  if (!parent) throw new NotFoundException('Price List Item not found for this tenant.');
  return parent;
}

export function validatePriceItemDiscount(parent: PriceListItem, dto: DiscountInput) {
  const from = validDate(dto.effectiveFrom, 'Effective From');
  const to = dto.effectiveTo ? validDate(dto.effectiveTo, 'Effective To') : null;
  if (to && to < from) throw new BadRequestException('Effective To must be greater than or equal to Effective From.');
  if (!parent.isActive || (parent.effectiveTo && parent.effectiveTo < from)) throw new BadRequestException('An ended Price List Item cannot receive a discount.');
  if (from < parent.effectiveFrom) throw new BadRequestException('Discount validity must fall inside the parent price validity.');
  if (parent.effectiveTo && (!to || to > parent.effectiveTo)) throw new BadRequestException('Discount validity must fall inside the parent price validity.');
  if (!parent.effectiveTo && to === null) { /* open child is valid only for an open parent */ }
  const value = decimal4(dto.discountValue);
  if (value <= 0n) throw new BadRequestException('Discount value must be greater than zero.');
  if (dto.discountType === PriceListItemDiscountType.PERCENTAGE && value > decimal4('100'))
    throw new BadRequestException('Percentage discount cannot exceed 100.');
  discountBreakdown(parent.sellingPrice, dto.discountType, dto.discountValue);
  return { from, to };
}

async function assertNoOverlap(
  manager: EntityManager,
  tenantId: number,
  priceListItemId: number,
  from: Date,
  to: Date | null,
  excludeId?: number,
) {
  const builder = manager
    .getRepository(PriceListItemDiscount)
    .createQueryBuilder('discount')
    .setLock('pessimistic_write')
    .where(
      'discount.tenantId = :tenantId ' +
        'AND discount.priceListItemId = :priceListItemId ' +
        'AND discount.isActive = 1',
      { tenantId, priceListItemId },
    )
    .andWhere(
      '(discount.effectiveTo IS NULL OR discount.effectiveTo >= :from)',
      { from },
    );

  if (to !== null) {
    builder.andWhere('discount.effectiveFrom <= :to', { to });
  }

  if (excludeId) {
    builder.andWhere(
      'discount.priceListItemDiscountId <> :excludeId',
      { excludeId },
    );
  }

  if (await builder.getOne()) {
    throw new BadRequestException(
      'Discount validity overlaps another active or scheduled discount.',
    );
  }
}

export async function createDiscountWithManager(manager: EntityManager, parent: PriceListItem, tenantId: number, userId: number, dto: DiscountInput) {
  const { from, to } = validatePriceItemDiscount(parent, dto);
  await assertNoOverlap(manager, tenantId, Number(parent.priceListItemId), from, to);
  const repo = manager.getRepository(PriceListItemDiscount);
  return repo.save(repo.create({ tenantId, priceListItemId: parent.priceListItemId, discountType: dto.discountType, discountValue: dto.discountValue, effectiveFrom: from, effectiveTo: to, isActive: true, createdBy: userId, endedBy: null }));
}

export async function endDiscountsForPriceItemWithManager(manager: EntityManager, priceListItemId: number, tenantId: number, boundary: Date, userId: number) {
  const rows = await manager.getRepository(PriceListItemDiscount).createQueryBuilder('discount')
    .setLock('pessimistic_write')
    .where('discount.tenantId = :tenantId AND discount.priceListItemId = :priceListItemId AND discount.isActive = 1', { tenantId, priceListItemId })
    .andWhere('(discount.effectiveTo IS NULL OR discount.effectiveTo > :boundary)', { boundary })
    .getMany();
  const repo = manager.getRepository(PriceListItemDiscount);
  for (const row of rows) {
    if (row.effectiveFrom > boundary) await repo.update({ priceListItemDiscountId: row.priceListItemDiscountId, tenantId }, { isActive: false, effectiveTo: boundary, endedBy: userId });
    else await repo.update({ priceListItemDiscountId: row.priceListItemDiscountId, tenantId }, { effectiveTo: boundary, endedBy: userId });
  }
}

@Injectable()
export class PriceListItemDiscountService {
  constructor(@InjectRepository(PriceListItemDiscount) private readonly repo: Repository<PriceListItemDiscount>, private readonly dataSource: DataSource) {}

  publishDiscount(priceListItemId: number, dto: PublishPriceListItemDiscountDto, tenantId: number, userId: number) {
    return this.dataSource.transaction(async (manager) => createDiscountWithManager(manager, await lockedParent(manager, priceListItemId, tenantId), tenantId, userId, dto));
  }

  changeDiscount(priceListItemId: number, dto: ChangePriceListItemDiscountDto, tenantId: number, userId: number) {
    return this.dataSource.transaction(async (manager) => {
      const parent = await lockedParent(manager, priceListItemId, tenantId);
      const { from } = validatePriceItemDiscount(parent, dto);
      const current = await manager.getRepository(PriceListItemDiscount).createQueryBuilder('discount')
        .setLock('pessimistic_write')
        .where('discount.tenantId = :tenantId AND discount.priceListItemId = :priceListItemId AND discount.isActive = 1', { tenantId, priceListItemId })
        .andWhere('discount.effectiveFrom <= :from AND (discount.effectiveTo IS NULL OR discount.effectiveTo >= :from)', { from })
        .orderBy('discount.effectiveFrom', 'DESC').getOne();
      if (!current) throw new NotFoundException('No applicable discount exists to change.');
      if (from <= current.effectiveFrom) throw new BadRequestException('Replacement discount must start after the current discount.');
      const end = new Date(from.getTime() - 1);
      await manager.getRepository(PriceListItemDiscount).update({ priceListItemDiscountId: current.priceListItemDiscountId, tenantId }, { effectiveTo: end, endedBy: userId });
      return createDiscountWithManager(manager, parent, tenantId, userId, dto);
    });
  }

  endDiscount(discountId: number, dto: EndPriceListItemDiscountDto, tenantId: number, userId: number) {
    return this.dataSource.transaction(async (manager) => {
      const seed = await manager.getRepository(PriceListItemDiscount).findOneBy({ priceListItemDiscountId: discountId, tenantId });
      if (!seed) throw new NotFoundException('Discount not found for this tenant.');
      const parent = await lockedParent(manager, Number(seed.priceListItemId), tenantId);
      const row = await manager.getRepository(PriceListItemDiscount).createQueryBuilder('discount').setLock('pessimistic_write')
        .where('discount.priceListItemDiscountId = :discountId AND discount.tenantId = :tenantId', { discountId, tenantId }).getOne();
      if (!row) throw new NotFoundException('Discount not found for this tenant.');
      const end = validDate(dto.effectiveTo, 'Effective To');
      if (end < row.effectiveFrom) throw new BadRequestException('Effective To cannot be before Effective From.');
      if (parent.effectiveTo && end > parent.effectiveTo) throw new BadRequestException('Discount validity must fall inside the parent price validity.');
      if (row.effectiveTo && end > row.effectiveTo) throw new BadRequestException('Ending a discount cannot extend its published validity.');
      await manager.getRepository(PriceListItemDiscount).update({ priceListItemDiscountId: discountId, tenantId }, { effectiveTo: end, endedBy: userId });
      return manager.getRepository(PriceListItemDiscount).findOneByOrFail({ priceListItemDiscountId: discountId, tenantId });
    });
  }

  async findActiveDiscount(priceListItemId: number, tenantId: number, at = new Date(), manager: EntityManager = this.dataSource.manager) {
    await this.assertParentOwner(manager, priceListItemId, tenantId);
    return manager.getRepository(PriceListItemDiscount).createQueryBuilder('discount')
      .where('discount.tenantId = :tenantId AND discount.priceListItemId = :priceListItemId AND discount.isActive = 1', { tenantId, priceListItemId })
      .andWhere('discount.effectiveFrom <= :at AND (discount.effectiveTo IS NULL OR discount.effectiveTo >= :at)', { at })
      .orderBy('discount.effectiveFrom', 'DESC').getOne();
  }

  async getDiscountHistory(priceListItemId: number, tenantId: number, page = 1, limit = 20) {
    const parent = await this.assertParentOwner(this.dataSource.manager, priceListItemId, tenantId);
    page = Math.max(1, page); limit = Math.min(100, Math.max(1, limit));
    const [items, totalItems] = await this.repo.findAndCount({ where: { tenantId, priceListItemId }, relations: { createdByUser: true, endedByUser: true }, order: { effectiveFrom: 'DESC', priceListItemDiscountId: 'DESC' }, skip: (page - 1) * limit, take: limit });
    return { items: items.map((row) => this.response(row, parent)), page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)) };
  }

  endDiscountsForPriceItem(priceListItemId: number, tenantId: number, boundary: Date, userId: number, manager?: EntityManager) {
    return manager ? endDiscountsForPriceItemWithManager(manager, priceListItemId, tenantId, boundary, userId) : this.dataSource.transaction((transaction) => endDiscountsForPriceItemWithManager(transaction, priceListItemId, tenantId, boundary, userId));
  }

  async resolveSellingPrice(dto: ResolveSellingPriceDto, tenantId: number) {
    const at = validDate(dto.transactionDate, 'Transaction Date');
    const quantity = decimal4(dto.quantity);
    const rows = await this.dataSource.manager.getRepository(PriceListItem).createQueryBuilder('price')
      .where('price.tenantId = :tenantId AND price.productId = :productId AND price.productUnitId = :productUnitId AND price.priceListId = :priceListId AND price.isActive = 1', { tenantId, productId: dto.productId, productUnitId: dto.productUnitId, priceListId: dto.priceListId })
      .andWhere('price.effectiveFrom <= :at AND (price.effectiveTo IS NULL OR price.effectiveTo >= :at)', { at })
      .orderBy('price.minimumQuantity', 'DESC').addOrderBy('price.effectiveFrom', 'DESC').getMany();
    const price = rows.find((row) => decimal4(row.minimumQuantity) <= quantity);
    if (!price) throw new NotFoundException('No valid selling price was found.');
    const discount = await this.findActiveDiscount(Number(price.priceListItemId), tenantId, at);
    const breakdown = discount ? discountBreakdown(price.sellingPrice, discount.discountType, discount.discountValue) : null;
    // Future SaleLine integration must snapshot: priceListId, priceListItemId,
    // priceListItemDiscountId, originalUnitPrice, discountType, discountValue,
    // discountAmount, finalUnitPrice, lineSubtotal, taxAmount, and lineTotal.
    return { priceListItemId: Number(price.priceListItemId), productId: Number(price.productId), productUnitId: Number(price.productUnitId), priceListId: Number(price.priceListId), originalUnitPrice: format4(decimal4(price.sellingPrice)), discount: discount ? { id: Number(discount.priceListItemDiscountId), type: discount.discountType, value: format4(decimal4(discount.discountValue)), amountPerUnit: breakdown!.amount } : null, finalUnitPrice: breakdown?.finalPrice ?? format4(decimal4(price.sellingPrice)), currencyCode: price.currencyCode };
  }

  async breakdownForItem(parent: PriceListItem, tenantId: number, at = new Date(), manager: EntityManager = this.dataSource.manager) {
    let discount = await this.findActiveDiscount(Number(parent.priceListItemId), tenantId, at, manager);
    if (!discount) discount = await manager.getRepository(PriceListItemDiscount).createQueryBuilder('discount')
      .where('discount.tenantId = :tenantId AND discount.priceListItemId = :priceListItemId AND discount.isActive = 1', { tenantId, priceListItemId: parent.priceListItemId })
      .andWhere('discount.effectiveFrom > :at', { at })
      .orderBy('discount.effectiveFrom', 'ASC').getOne();
    const values = discount ? discountBreakdown(parent.sellingPrice, discount.discountType, discount.discountValue) : null;
    const status = discount ? discountStatus(discount, at) : null;
    return {
      currentDiscount: discount ? this.response(discount, parent) : null,
      finalUnitPrice: status === 'CURRENT' ? values!.finalPrice : format4(decimal4(parent.sellingPrice)),
      discountedUnitPrice: values?.finalPrice ?? null,
    };
  }

  private async assertParentOwner(manager: EntityManager, priceListItemId: number, tenantId: number) {
    const parent = await manager.getRepository(PriceListItem).findOneBy({ priceListItemId, tenantId });
    if (!parent) throw new NotFoundException('Price List Item not found for this tenant.');
    return parent;
  }

  private response(row: PriceListItemDiscount, parent: PriceListItem) {
    const values = discountBreakdown(parent.sellingPrice, row.discountType, row.discountValue);
    return { priceListItemDiscountId: Number(row.priceListItemDiscountId), discountType: row.discountType, discountValue: row.discountValue, basePrice: parent.sellingPrice, discountAmount: values.amount, finalUnitPrice: values.finalPrice, effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo, status: discountStatus(row), createdBy: row.createdByUser ? { userId: Number(row.createdByUser.userId), username: row.createdByUser.username } : { userId: Number(row.createdBy) }, endedBy: row.endedByUser ? { userId: Number(row.endedByUser.userId), username: row.endedByUser.username } : row.endedBy ? { userId: Number(row.endedBy) } : null };
  }
}
