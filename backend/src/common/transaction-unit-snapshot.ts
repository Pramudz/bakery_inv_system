import { ProductUnit } from '../features/product-units/product-units.entity';
import { PurchaseOrderLine } from '../features/purchase-orders/purchase-order-line.entity';

export function productUnitSnapshot(productUnit: Pick<ProductUnit, 'productUnitId' | 'unitId' | 'conversionFactor'>) {
  return {
    productUnitId: Number(productUnit.productUnitId),
    unitId: Number(productUnit.unitId),
    conversionFactorSnapshot: String(productUnit.conversionFactor),
  };
}

export function purchaseOrderLineSnapshot(line: Pick<PurchaseOrderLine,
  'productId' | 'productUnitId' | 'unitId' | 'conversionFactorSnapshot' |
  'unitCost' | 'discountAmount' | 'taxAmount' | 'netUnitCost' | 'sourceSupplierPriceId'
>) {
  return {
    productId: Number(line.productId),
    productUnitId: Number(line.productUnitId),
    unitId: Number(line.unitId),
    conversionFactorSnapshot: String(line.conversionFactorSnapshot),
    unitCost: String(line.unitCost),
    discountAmount: String(line.discountAmount),
    taxAmount: String(line.taxAmount),
    netUnitCost: String(line.netUnitCost),
    sourceSupplierPriceId: line.sourceSupplierPriceId,
  };
}

export function baseInventorySnapshot(receivedQuantity: number, netUnitCost: number, conversionFactorSnapshot: number) {
  if (!(conversionFactorSnapshot > 0)) throw new Error('Invalid product-unit conversion snapshot.');
  return {
    baseQuantity: receivedQuantity * conversionFactorSnapshot,
    baseUnitCost: netUnitCost / conversionFactorSnapshot,
    movementValue: receivedQuantity * netUnitCost,
  };
}
