import assert from "node:assert/strict";
import test from "node:test";
import {
  canCompleteSale,
  conversionMatchesCheckout,
} from "./billingCheckoutEligibility.ts";
import { summarizePaymentEntries, validatePaymentSequence } from "../paymentDraft.ts";

const quotation = {
  quotationId: 42,
  status: "ACCEPTED",
  locationId: 5,
  customerId: 7,
  quotationType: "RETAIL",
  lines: [{ productId: 11, quantity: "2.0000" }],
};
const cart = [{ productId: 11, qty: 2 }];
const conversionReady = (overrides = {}, checkout = {}) =>
  conversionMatchesCheckout(
    { ...quotation, ...overrides },
    checkout.sourceQuotationId ?? 42,
    checkout.locationId ?? 5,
    checkout.customerId ?? 7,
    checkout.saleType ?? "RETAIL",
    checkout.cart ?? cart,
  );
const readyCheckout = {
  sourceQuotationId: 42,
  conversionReady: true,
  cartReady: true,
  locationReady: true,
  checkoutPending: false,
  quotePending: true, // A disabled normal-pricing query is pending without data.
  quoteError: false,
  hasActiveQuote: true,
  creditReady: true,
  sessionReady: true,
  paymentEntryPending: false,
};

test("accepted quotation with settled payment and an open POS session can complete", () => {
  assert.equal(conversionReady(), true);
  const cash = [{ id: "cash", paymentMethodId: 1, name: "Cash", type: "CASH", amount: 3765 }];
  assert.equal(validatePaymentSequence(3765, cash), undefined);
  assert.equal(summarizePaymentEntries(3765, cash).remaining, 0);
  assert.equal(canCompleteSale(readyCheckout), true);
  assert.equal(canCompleteSale({ ...readyCheckout, quoteError: true }), true);
});

test("quotation checkout still requires register, payment, and authorized credit", () => {
  assert.equal(summarizePaymentEntries(3765, []).remaining, 3765);
  assert.equal(canCompleteSale({ ...readyCheckout, sessionReady: false }), false);
  assert.equal(canCompleteSale({ ...readyCheckout, creditReady: false }), false);
  assert.equal(canCompleteSale({ ...readyCheckout, creditReady: true }), true);
  assert.equal(canCompleteSale({ ...readyCheckout, paymentEntryPending: true }), false);
  assert.equal(canCompleteSale({ ...readyCheckout, checkoutPending: true }), false);
});

test("quotation checkout rejects missing, sent, converted, or mismatched previews", () => {
  assert.equal(conversionMatchesCheckout(undefined, 42, 5, 7, "RETAIL", cart), false);
  assert.equal(conversionReady({ status: "SENT" }), false);
  assert.equal(conversionReady({ status: "CONVERTED" }), false);
  assert.equal(conversionReady({}, { locationId: 6 }), false);
  assert.equal(conversionReady({}, { customerId: 8 }), false);
  assert.equal(conversionReady({}, { cart: [{ productId: 11, qty: 3 }] }), false);
  assert.equal(canCompleteSale({ ...readyCheckout, conversionReady: false }), false);
});

test("normal POS still waits for current prices and other checkout requirements", () => {
  const normal = { ...readyCheckout, sourceQuotationId: 0, conversionReady: false, quotePending: false };
  assert.equal(canCompleteSale(normal), true);
  assert.equal(canCompleteSale({ ...normal, quotePending: true }), false);
  assert.equal(canCompleteSale({ ...normal, quoteError: true }), false);
  assert.equal(canCompleteSale({ ...normal, hasActiveQuote: false }), false);
  assert.equal(canCompleteSale({ ...normal, cartReady: false }), false);
  assert.equal(canCompleteSale({ ...normal, locationReady: false }), false);
});
