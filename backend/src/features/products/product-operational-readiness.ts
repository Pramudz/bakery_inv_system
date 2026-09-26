import { BadRequestException, NotFoundException } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { PriceListItem } from "../price-list-items/price-list-items.entity";
import { ProductLocation } from "../product-locations/product-locations.entity";
import { ProductSupplierPrice } from "../product-supplier-prices/product-supplier-price.entity";
import { Product } from "./products.entity";
import { tenantBusinessClock } from "../../common/business-date";

export async function assertProductOperationalReadiness(
  manager: EntityManager,
  productId: number,
  tenantId: number,
  now = new Date(),
) {
  const clock = await tenantBusinessClock(manager, tenantId, now);
  const currentInstant = clock.now;
  const product = await manager
    .getRepository(Product)
    .findOneBy({ productId, tenantId });
  if (!product) throw new NotFoundException("Product not found.");
  if (!product.isActive) return;

  if (product.isSellable) {
    const currentSellingPrices = await manager
      .getRepository(PriceListItem)
      .createQueryBuilder("price")
      .innerJoin("price.priceList", "priceList")
      .innerJoin("price.productUnit", "productUnit")
      .where("price.tenantId = :tenantId AND price.productId = :productId", {
        tenantId,
        productId,
      })
      .andWhere("price.isActive = 1 AND price.sellingPrice > 0")
      .andWhere("priceList.isActive = 1")
      .andWhere(
        "productUnit.isActive = 1 AND productUnit.isBaseUnit = 1 AND productUnit.isSalesUnit = 1 AND productUnit.conversionFactor = 1",
      )
      .andWhere(
        "price.effectiveFrom <= :now AND " +
          "(price.effectiveTo IS NULL OR price.effectiveTo >= :now)",
        { now: currentInstant },
      )
      .getCount();
    if (!currentSellingPrices)
      throw new BadRequestException(
        "An active sellable product requires at least one current effective selling price.",
      );
  }

  if (product.isPurchasable) {
    const currentSupplierPrices = await manager
      .getRepository(ProductSupplierPrice)
      .createQueryBuilder("price")
      .innerJoin("price.productSupplierUnit", "supplierUnit")
      .innerJoin("supplierUnit.productSupplier", "supplierLink")
      .innerJoin("supplierUnit.productUnit", "productUnit")
      .where("supplierLink.productId = :productId", { productId })
      .andWhere("supplierLink.isActive = 1 AND supplierUnit.isActive = 1")
      .andWhere(
        "productUnit.productId = :productId AND productUnit.isActive = 1 AND productUnit.isPurchaseUnit = 1",
        { productId },
      )
      .andWhere("price.isActive = 1 AND price.purchasePrice > 0")
      .andWhere(
        "price.effectiveFrom <= :now AND " +
          "(price.effectiveTo IS NULL OR price.effectiveTo >= :now)",
        { now: currentInstant },
      )
      .getCount();
    if (!currentSupplierPrices)
      throw new BadRequestException(
        "An active purchasable product requires an active supplier, supplier purchase unit, and current effective positive supplier price.",
      );
  }

  if (product.isStockItem) {
    const activeLocations = await manager
      .getRepository(ProductLocation)
      .countBy({ productId, isActive: true });
    if (!activeLocations)
      throw new BadRequestException(
        "An active stock item requires at least one active product location.",
      );
  }
}
