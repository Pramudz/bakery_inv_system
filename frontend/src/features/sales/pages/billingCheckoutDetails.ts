import type { CreateInvoiceInput, InvoiceQuoteLine } from "../api/invoicesApi";

export function billingCheckoutDetail(
  productId: number,
  quantity: number,
  unitPrice: number,
  price: InvoiceQuoteLine | undefined,
  sourceQuotationId: number,
): CreateInvoiceInput["details"][number] {
  return {
    productId,
    quantity,
    unitPrice,
    discountPercentage: price?.discountPercentage ?? 0,
    discountAmount: price?.discountAmount ?? 0,
    ...(!sourceQuotationId && price?.priceListItemId
      ? {
          quotedPriceListItemId: price.priceListItemId,
          quotedPriceListItemDiscountId:
            price.priceListItemDiscountId ?? undefined,
        }
      : {}),
    quotedUnitPrice: price?.unitPrice,
    quotedDiscountAmount: price?.discountAmount,
  };
}
