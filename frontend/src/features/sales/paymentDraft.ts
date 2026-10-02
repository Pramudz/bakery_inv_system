export type PaymentMethodType = "CASH" | "CARD" | "CHEQUE";

export type PosPaymentEntry = {
  id: string;
  paymentMethodId: number;
  name: string;
  type: PaymentMethodType;
  amount: number;
  paymentChannelId?: number;
  channelName?: string;
  referenceNumber?: string;
};

const money = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export function summarizePaymentEntries(
  invoiceTotal: number,
  entries: PosPaymentEntry[],
) {
  let remaining = money(Math.max(0, invoiceTotal));
  let tendered = 0;
  let applied = 0;
  let change = 0;

  for (const entry of entries) {
    const entryTendered = money(Math.max(0, Number(entry.amount) || 0));
    const entryApplied = money(Math.min(entryTendered, remaining));
    const entryChange =
      entry.type === "CASH" ? money(entryTendered - entryApplied) : 0;
    tendered = money(tendered + entryTendered);
    applied = money(applied + entryApplied);
    change = money(change + entryChange);
    remaining = money(remaining - entryApplied);
  }

  return {
    tendered,
    applied,
    change,
    netReceived: money(tendered - change),
    remaining,
  };
}

export function validatePaymentDraft(input: {
  invoiceTotal: number;
  entries: PosPaymentEntry[];
  methodType?: PaymentMethodType;
  amount: number;
  channelId?: number;
  referenceNumber?: string;
}) {
  const errors: Record<string, string> = {};
  const remaining = summarizePaymentEntries(
    input.invoiceTotal,
    input.entries,
  ).remaining;

  if (!input.methodType) errors.method = "Select an active payment method.";
  if (!Number.isFinite(input.amount) || input.amount <= 0)
    errors.amount = "Enter an amount greater than zero.";
  else if (remaining <= 0)
    errors.amount = "The invoice is already fully covered.";
  else if (input.methodType !== "CASH" && input.amount > remaining) {
    errors.amount = "Only cash can exceed the remaining balance.";
  }

  if (input.methodType === "CARD") {
    if (!input.channelId) errors.channel = "Select an active card channel.";
    if (!input.referenceNumber?.trim())
      errors.reference = "Enter the approval or transaction reference.";
  }

  return errors;
}

export function validatePaymentSequence(
  invoiceTotal: number,
  entries: PosPaymentEntry[],
) {
  let remaining = money(Math.max(0, invoiceTotal));
  for (const entry of entries) {
    const amount = money(Number(entry.amount));
    if (!Number.isFinite(amount) || amount <= 0)
      return `${entry.name} must have an amount greater than zero.`;
    if (remaining <= 0)
      return `Remove ${entry.name}; the invoice is already fully covered.`;
    if (entry.type !== "CASH" && amount > remaining) {
      return `${entry.name} exceeds the balance it can settle. Only cash can be over-tendered.`;
    }
    remaining = money(Math.max(0, remaining - amount));
  }
  return undefined;
}
