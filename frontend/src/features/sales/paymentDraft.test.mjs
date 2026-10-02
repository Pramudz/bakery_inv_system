import assert from "node:assert/strict";
import test from "node:test";
import {
  summarizePaymentEntries,
  validatePaymentDraft,
  validatePaymentSequence,
} from "./paymentDraft.ts";

const entry = (type, amount, extra = {}) => ({
  id: crypto.randomUUID(),
  paymentMethodId: 1,
  name: type,
  type,
  amount,
  ...extra,
});

test("split amounts produce the correct collected and remaining totals", () => {
  assert.deepEqual(
    summarizePaymentEntries(1_000, [entry("CASH", 250), entry("CARD", 400)]),
    {
      tendered: 650,
      applied: 650,
      change: 0,
      netReceived: 650,
      remaining: 350,
    },
  );
});

test("cash tender above the remaining balance is returned as change", () => {
  assert.deepEqual(
    summarizePaymentEntries(1_000, [entry("CARD", 600), entry("CASH", 500)]),
    {
      tendered: 1_100,
      applied: 1_000,
      change: 100,
      netReceived: 1_000,
      remaining: 0,
    },
  );
});

test("card validation requires a channel and approval reference", () => {
  assert.deepEqual(
    validatePaymentDraft({
      invoiceTotal: 500,
      entries: [],
      methodType: "CARD",
      amount: 500,
    }),
    {
      channel: "Select an active card channel.",
      reference: "Enter the approval or transaction reference.",
    },
  );
});

test("noncash payment cannot exceed the balance it settles", () => {
  const errors = validatePaymentDraft({
    invoiceTotal: 500,
    entries: [],
    methodType: "CHEQUE",
    amount: 501,
  });
  assert.equal(errors.amount, "Only cash can exceed the remaining balance.");
});

test("an edited split cannot make a later noncash entry exceed the balance", () => {
  assert.equal(
    validatePaymentSequence(1_000, [entry("CASH", 700), entry("CARD", 500)]),
    "CARD exceeds the balance it can settle. Only cash can be over-tendered.",
  );
});
