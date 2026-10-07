import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { PriceListItemDiscountService } from '../price-list-item-discounts/price-list-item-discounts.service';
import { PriceList } from '../price-lists/price-lists.entity';
import { ProductLocation } from '../product-locations/product-locations.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { Product } from '../products/products.entity';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function normalizedPriceListType(value: string) {
  const type = value.trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (type === 'WHOLE' || type === 'WHOLSALE') return 'WHOLESALE';
  return type;
}

export type PosSaleType = 'RETAIL' | 'WHOLESALE';

export interface PosPriceLineRequest {
  productId: number;
  quantity: number;
}

export interface PosPriceLine {
  productId: number;
  sourceQuotationLineId?: number | null;
  quotedSkuSnapshot?: string;
  quotedProductNameSnapshot?: string;
  quotedUnitId?: number;
  quotedUnitCodeSnapshot?: string;
  quotedUnitNameSnapshot?: string;
  productUnitId: number | null;
  priceListId: number | null;
  priceListItemId: number | null;
  priceListItemDiscountId: number | null;
  discountType: string | null;
  discountValue: string | null;
  quantity: number;
  unitPrice: number;
  discountPerUnit: number;
  discountPercentage: number;
  grossTotal: number;
  discountAmount: number;
  netTotal: number;
  currencyCode: string;
}

@Injectable()
export class PosPricingService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly discounts: PriceListItemDiscountService,
  ) {}

  quote(
    tenantId: number,
    locationId: number,
    saleType: PosSaleType,
    details: PosPriceLineRequest[],
    at = new Date(),
    manager: EntityManager = this.dataSource.manager,
  ) {
    return this.quoteWithManager(manager, tenantId, locationId, saleType, details, at);
  }

  async quoteWithManager(
    manager: EntityManager,
    tenantId: number,
    locationId: number,
    saleType: PosSaleType,
    details: PosPriceLineRequest[],
    at = new Date(),
  ) {
    const duplicate = details.find((line, index) => details.findIndex((candidate) => candidate.productId === line.productId) !== index);
    if (duplicate) throw new BadRequestException(`Product ${duplicate.productId} cannot appear more than once in a sale.`);
    const priceList = await this.priceList(manager, tenantId, saleType);
    const lines: PosPriceLine[] = [];
    for (const request of details) {
      lines.push(await this.line(manager, tenantId, locationId, priceList, request, at));
    }
    const subtotal = money(lines.reduce((sum, line) => sum + line.grossTotal, 0));
    const discountTotal = money(lines.reduce((sum, line) => sum + line.discountAmount, 0));
    return {
      quotedAt: at.toISOString(),
      locationId,
      saleType,
      priceList: { priceListId: Number(priceList.priceListId), code: priceList.code, name: priceList.name },
      lines,
      subtotal,
      discountTotal,
      grandTotal: money(subtotal - discountTotal),
    };
  }

  private async priceList(manager: EntityManager, tenantId: number, saleType: PosSaleType) {
    const candidates = (await manager.getRepository(PriceList).findBy({ tenantId, isActive: true }))
      .filter((row) => normalizedPriceListType(row.priceListType) === saleType);
    const defaults = candidates.filter((row) => row.isDefault);
    if (defaults.length === 1) return defaults[0];
    if (defaults.length > 1) {
      throw new ConflictException({ code: 'POS_PRICE_LIST_AMBIGUOUS', message: `More than one active default ${saleType.toLowerCase()} price list exists.` });
    }
    if (candidates.length === 1) return candidates[0];
    if (!candidates.length) throw new NotFoundException(`No active ${saleType.toLowerCase()} price list was found.`);
    throw new ConflictException({ code: 'POS_PRICE_LIST_AMBIGUOUS', message: `Choose one default ${saleType.toLowerCase()} price list before billing.` });
  }

  private async line(
    manager: EntityManager,
    tenantId: number,
    locationId: number,
    priceList: PriceList,
    request: PosPriceLineRequest,
    at: Date,
  ): Promise<PosPriceLine> {
    const quantity = Number(request.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new BadRequestException('Sale quantity must be positive.');
    const product = await manager.getRepository(Product).findOneBy({ productId: request.productId, tenantId, isActive: true, isSellable: true });
    if (!product) throw new NotFoundException(`Sellable product ${request.productId} was not found.`);
    const assignment = await manager.getRepository(ProductLocation).findOneBy({ productId: product.productId, locationId, isActive: true, isSellable: true });
    if (!assignment) throw new NotFoundException(`Product ${request.productId} is not sellable at this location.`);
    const productUnit = await manager.getRepository(ProductUnit).findOneBy({
      productId: product.productId,
      unitId: product.baseUnitId,
      isActive: true,
      isBaseUnit: true,
      isSalesUnit: true,
    });
    if (!productUnit || Number(productUnit.conversionFactor) !== 1) {
      throw new NotFoundException(`Product ${request.productId} has no active base sales unit.`);
    }
    const resolved = await this.discounts.resolveSellingPriceWithManager({
      productId: Number(product.productId),
      productUnitId: Number(productUnit.productUnitId),
      priceListId: Number(priceList.priceListId),
      quantity: String(quantity),
      transactionDate: at.toISOString(),
    }, tenantId, manager);
    const unitPrice = Number(resolved.originalUnitPrice);
    const discountPerUnit = Number(resolved.discount?.amountPerUnit ?? 0);
    const grossTotal = money(quantity * unitPrice);
    const discountAmount = money(quantity * discountPerUnit);
    return {
      productId: Number(product.productId),
      productUnitId: Number(productUnit.productUnitId),
      priceListId: Number(priceList.priceListId),
      priceListItemId: Number(resolved.priceListItemId),
      priceListItemDiscountId: resolved.discount?.id ?? null,
      discountType: resolved.discount?.type ?? null,
      discountValue: resolved.discount?.value ?? null,
      quantity,
      unitPrice: money(unitPrice),
      discountPerUnit: money(discountPerUnit),
      discountPercentage: resolved.discount?.type === 'PERCENTAGE'
        ? Number(resolved.discount.value)
        : grossTotal ? Number(((discountAmount / grossTotal) * 100).toFixed(4)) : 0,
      grossTotal,
      discountAmount,
      netTotal: money(grossTotal - discountAmount),
      currencyCode: resolved.currencyCode,
    };
  }
}
