import { useQuery } from "@tanstack/react-query";
import { productsApi } from "../products/api/productsApi";

function num(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

function supplierLink(product: any, supplierId: string) {
  return (product?.productSuppliers ?? []).find(
    (link: any) =>
      link.isActive !== false && String(link.supplierId) === supplierId,
  );
}

export function purchaseUnits(product: any, supplierId: string) {
  const link = supplierLink(product, supplierId);
  return (link?.supplierUnits ?? [])
    .filter((supplierUnit: any) => supplierUnit.isActive !== false)
    .map((supplierUnit: any) => {
      const productUnit = (product?.productUnits ?? []).find(
        (unit: any) =>
          unit.isActive !== false &&
          unit.isPurchaseUnit &&
          Number(unit.productUnitId) === Number(supplierUnit.productUnitId),
      );
      return productUnit ? { supplierUnit, productUnit } : null;
    })
    .filter(Boolean) as Array<{ supplierUnit: any; productUnit: any }>;
}

export function supplierPrice(
  supplierUnit: any,
  receiptDate: string,
  quantity: string,
  currencyCode: string,
) {
  return (supplierUnit?.prices ?? [])
    .filter(
      (price: any) =>
        price.isActive !== false &&
        String(price.currencyCode ?? "").toUpperCase() === currencyCode &&
        num(price.minimumQuantity) <= num(quantity) &&
        String(price.effectiveFrom).slice(0, 10) <= receiptDate &&
        (!price.effectiveTo ||
          String(price.effectiveTo).slice(0, 10) >= receiptDate),
    )
    .sort(
      (a: any, b: any) =>
        num(b.minimumQuantity) - num(a.minimumQuantity) ||
        String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)),
    )[0];
}

// Shared Product API search for purchasing screens; the backend performs SKU/barcode/name matching.
export function usePurchasingProductSearch(search: string, enabled: boolean, scope = "grn-search") {
  return useQuery({
    queryKey: ["products", scope, search],
    queryFn: () => productsApi.page({ page: 1, limit: 20, search, status: "active" }),
    enabled: enabled && search.length > 0,
  });
}
