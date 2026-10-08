type CheckoutEligibility = {
  sourceQuotationId: number;
  conversionReady: boolean;
  cartReady: boolean;
  locationReady: boolean;
  checkoutPending: boolean;
  quotePending: boolean;
  quoteError: boolean;
  hasActiveQuote: boolean;
  creditReady: boolean;
  sessionReady: boolean;
  paymentEntryPending: boolean;
};

type ConversionSnapshot = {
  quotationId: number;
  status: string;
  locationId: number;
  customerId: number;
  quotationType: string;
  lines: { productId: number; quantity: string }[];
};

export function conversionMatchesCheckout(
  quotation: ConversionSnapshot | undefined,
  sourceQuotationId: number,
  locationId: number,
  customerId: number | undefined,
  saleType: string,
  cart: { productId: number; qty: number }[],
): boolean {
  return Boolean(
    quotation &&
    quotation.status === "ACCEPTED" &&
    Number(quotation.quotationId) === sourceQuotationId &&
    Number(quotation.locationId) === locationId &&
    Number(quotation.customerId) === customerId &&
    quotation.quotationType === saleType &&
    quotation.lines.length === cart.length &&
    quotation.lines.every((line, index) =>
      Number(line.productId) === cart[index]?.productId &&
      Number(line.quantity) === cart[index]?.qty,
    ),
  );
}

export function canCompleteSale(input: CheckoutEligibility): boolean {
  const pricingReady = input.sourceQuotationId > 0
    ? input.conversionReady && input.hasActiveQuote
    : !input.quotePending && !input.quoteError && input.hasActiveQuote;

  return input.cartReady && input.locationReady && !input.checkoutPending &&
    pricingReady && input.creditReady && input.sessionReady &&
    !input.paymentEntryPending;
}
