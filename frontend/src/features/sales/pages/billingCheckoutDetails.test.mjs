import assert from "node:assert/strict";
import test from "node:test";
import { billingCheckoutDetail } from "./billingCheckoutDetails.ts";

const price = {
  productId: 25,
  quantity: 2,
  unitPrice: 200,
  discountPercentage: 0,
  discountAmount: 0,
  priceListItemId: 40,
  priceListItemDiscountId: null,
};

test("normal POS sends its real price-list item ID", () => {
  const detail = billingCheckoutDetail(25, 2, 200, price, 0);
  assert.equal(detail.quotedPriceListItemId, 40);
  assert.equal(detail.quotedUnitPrice, 200);
});

test("quotation conversion omits price-list IDs and keeps saved price", () => {
  const detail = billingCheckoutDetail(25, 2, 200, { ...price, priceListItemId: null }, 70);
  assert.equal(Object.hasOwn(detail, "quotedPriceListItemId"), false);
  assert.equal(Object.hasOwn(detail, "quotedPriceListItemDiscountId"), false);
  assert.equal(detail.quotedUnitPrice, 200);
  assert.equal(detail.discountAmount, 0);
});
