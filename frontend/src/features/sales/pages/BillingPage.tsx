import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { customersApi } from "../../customers/api/customersApi";
import { InvoiceQuote, invoicesApi } from "../api/invoicesApi";
import { InvoiceReceiptContent } from "./InvoiceReceiptContent";
import { downloadInvoiceReceipt } from "./invoiceReceiptPdf";
import { PaymentMethod, paymentMethodsApi } from "../api/paymentMethodsApi";
import { ApiError } from "../../../services/apiClient";
import { paymentChannelsApi } from "../api/paymentChannelsApi";
import { BillingLoyaltyArea } from "../components/BillingLoyaltyArea";
import {
  PosPaymentEntry,
  summarizePaymentEntries,
  validatePaymentDraft,
  validatePaymentSequence,
} from "../paymentDraft";
import { useAuth } from "../../auth/AuthContext";
import { posRegistersApi } from "../../pos-registers/api/posRegistersApi";
import "./billing-register-session.css";

type SaleType = "Retail" | "Wholesale";
type Product = {
  productId: number;
  code: string;
  category: string;
  name: string;
  retailPrice: number;
  wholesalePrice: number;
  stock: number;
};
type CartLine = Product & {
  qty: number;
  discountPct: number;
  discountRs: number;
};

type CustomerOption = {
  customerId: number;
  code: string;
  name: string;
  phone: string;
};
type PaymentFieldErrors = Partial<
  Record<"method" | "amount" | "channel" | "reference" | "form", string>
>;

export function BillingPage() {
  const navigate = useNavigate();
  const { permissions, role } = useAuth();
  const saleTypeSection = useRef<HTMLDivElement>(null);
  const productSection = useRef<HTMLDivElement>(null);
  const cartSection = useRef<HTMLDivElement>(null);
  const customerSection = useRef<HTMLDivElement>(null);
  const paymentSection = useRef<HTMLDivElement>(null);
  const paymentMethodSection = useRef<HTMLDivElement>(null);
  const receiptModal = useRef<HTMLDivElement>(null);
  const [saleType, setSaleType] = useState<SaleType>("Retail");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerOption | null>(null);
  const [newCustomer, setNewCustomer] = useState(false);
  const [sellOnCredit, setSellOnCredit] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState(0);
  const [paid, setPaid] = useState("");
  const [paymentChannelId, setPaymentChannelId] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentValidation, setPaymentValidation] =
    useState<PaymentFieldErrors>({});
  const [locationId, setLocationId] = useState(0);
  const [openingBalance, setOpeningBalance] = useState("0");
  const [cashCountOpen, setCashCountOpen] = useState(false);
  const [countedCash, setCountedCash] = useState("");
  const [countSubmissionKey, setCountSubmissionKey] = useState(() => crypto.randomUUID());
  const [checkoutKey, setCheckoutKey] = useState(() => crypto.randomUUID());
  const [paymentEntries, setPaymentEntries] = useState<PosPaymentEntry[]>([]);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [completedInvoice, setCompletedInvoice] = useState<Record<
    string,
    any
  > | null>(null);
  const [priceChangeQuote, setPriceChangeQuote] = useState<InvoiceQuote | null>(
    null,
  );
  const locationsQuery = useQuery({
    queryKey: ["billing-locations"],
    queryFn: invoicesApi.billingLocations,
  });
  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: customersApi.list,
  });
  const methodsQuery = useQuery({
    queryKey: ["payment-methods"],
    queryFn: paymentMethodsApi.list,
  });
  const channelsQuery = useQuery({
    queryKey: ["payment-channels", "active"],
    queryFn: () => paymentChannelsApi.list(true),
  });
  const sessionQuery = useQuery({
    queryKey: ["pos-register-session", "context", locationId],
    queryFn: () => posRegistersApi.sessionContext(locationId),
    enabled: locationId > 0,
    retry: false,
  });
  const cashSummaryQuery = useQuery({
    queryKey: ["pos-register-closing", "current-summary", sessionQuery.data?.cashierSession?.posCashierSessionId],
    queryFn: posRegistersApi.currentCashSummary,
    enabled: cashCountOpen && sessionQuery.data?.config?.registerMode === "TERMINAL_REGISTER",
    retry: false,
  });
  const submitCashCount = useMutation({
    mutationFn: () => posRegistersApi.submitCashCount(Number(countedCash), countSubmissionKey),
    onSuccess: () => {
      setCashCountOpen(false);
      setCountedCash("");
      setCountSubmissionKey(crypto.randomUUID());
      void sessionQuery.refetch();
    },
  });
  useEffect(() => {
    const first = (locationsQuery.data ?? []).find(
      (x: any) => x.isActive !== false,
    );
    if (!locationId && first) setLocationId(Number(first.locationId));
  }, [locationsQuery.data, locationId]);
  const saleTypeCode = saleType.toUpperCase() as "RETAIL" | "WHOLESALE";
  const catalogQuery = useQuery({
    queryKey: ["invoice-catalog", locationId, saleTypeCode],
    queryFn: () => invoicesApi.catalog(locationId, saleTypeCode),
    enabled: locationId > 0,
  });
  const products: Product[] = (catalogQuery.data ?? []).map((x) => ({
    ...x,
    retailPrice: Number(x.retailPrice),
    wholesalePrice: Number(x.wholesalePrice),
    stock: Number(x.stock),
  }));
  const customers: CustomerOption[] = (customersQuery.data ?? [])
    .filter((x: any) => x.isActive !== false)
    .map((x: any) => ({
      customerId: Number(x.customerId),
      code: x.customerCode,
      name: x.customerName,
      phone: x.phone ?? "",
    }));
  const paymentMethods = (methodsQuery.data ?? []).filter(
    (x) => x.isActive && x.paymentMethodType,
  );
  useEffect(() => {
    if (!paymentMethodId && paymentMethods[0])
      setPaymentMethodId(paymentMethods[0].paymentMethodId);
  }, [paymentMethods, paymentMethodId]);
  const quoteQuery = useQuery({
    queryKey: [
      "invoice-quote",
      locationId,
      saleTypeCode,
      cart.map((line) => [line.productId, line.qty]),
    ],
    queryFn: () =>
      invoicesApi.quote({
        locationId,
        saleType: saleTypeCode,
        details: cart.map((line) => ({
          productId: line.productId,
          quantity: line.qty,
        })),
      }),
    enabled:
      locationId > 0 && cart.length > 0 && cart.every((line) => line.qty > 0),
    retry: false,
  });
  useEffect(() => {
    setPriceChangeQuote(null);
  }, [locationId, saleTypeCode, cart]);
  const activeQuote = priceChangeQuote ?? quoteQuery.data;
  const quotedLine = (x: Product) =>
    activeQuote?.lines.find(
      (line) => Number(line.productId) === Number(x.productId),
    );
  const unitPrice = (x: Product) =>
    quotedLine(x)?.unitPrice ??
    (saleType === "Retail" ? x.retailPrice : x.wholesalePrice);
  const lineGross = (x: CartLine) =>
    quotedLine(x)?.grossTotal ?? x.qty * unitPrice(x);
  const lineDiscount = (x: CartLine) => quotedLine(x)?.discountAmount ?? 0;
  const lineNet = (x: CartLine) =>
    quotedLine(x)?.netTotal ?? Math.max(0, lineGross(x) - lineDiscount(x));
  const subtotal = useMemo(
    () => activeQuote?.subtotal ?? cart.reduce((n, x) => n + lineGross(x), 0),
    [cart, saleType, activeQuote],
  );
  const discount = useMemo(
    () =>
      activeQuote?.discountTotal ??
      cart.reduce((n, x) => n + lineDiscount(x), 0),
    [cart, saleType, activeQuote],
  );
  const total = Math.max(0, subtotal - discount);
  const currentMethod = paymentMethods.find(
    (x) => x.paymentMethodId === paymentMethodId,
  );
  const paymentSummary = summarizePaymentEntries(total, paymentEntries);
  const editingPaymentIndex = editingPaymentId
    ? paymentEntries.findIndex((entry) => entry.id === editingPaymentId)
    : -1;
  const draftBaseEntries =
    editingPaymentIndex >= 0
      ? paymentEntries.slice(0, editingPaymentIndex)
      : paymentEntries;
  const paymentSequenceError = validatePaymentSequence(total, paymentEntries);
  const currentChannel = (channelsQuery.data ?? []).find(
    (row) => Number(row.paymentChannelId) === Number(paymentChannelId),
  );
  const paymentStatus =
    paymentSummary.remaining <= 0 && total > 0
      ? "Paid"
      : paymentSummary.applied > 0
        ? "Partially paid"
        : "Unpaid";
  const hasPermission = (code: string) =>
    role?.code === "TENANT_ADMIN" || permissions.includes(code);
  const canAuthorizeCredit = hasPermission("SALES_CREDIT_AUTHORIZE");
  const canOpenMasterRegister = hasPermission("SALES_REGISTER_OPEN");
  const sessionReady = sessionQuery.data?.canBill === true;
  const sessionMutation = useMutation({
    mutationFn: async () => {
      const action = sessionQuery.data?.action;
      const balance = Number(openingBalance);
      if (
        (action === "OPEN_TERMINAL_REGISTER" ||
          action === "OPEN_MASTER_REGISTER") &&
        (!Number.isFinite(balance) ||
          balance < 0 ||
          Math.round(balance * 100) / 100 !== balance)
      ) {
        throw new Error(
          "Opening balance must be nonnegative with at most two decimal places.",
        );
      }
      if (action === "OPEN_TERMINAL_REGISTER")
        return posRegistersApi.openTerminalRegister(balance);
      if (action === "OPEN_MASTER_REGISTER")
        return posRegistersApi.openMasterRegister(locationId, balance);
      if (action === "START_CASHIER_SESSION")
        return posRegistersApi.startCashierSession();
      throw new Error("No register session action is available.");
    },
    onSuccess: () => {
      setOpeningBalance("0");
      void sessionQuery.refetch();
    },
  });
  const creditRequired = paymentSummary.remaining > 0;
  const creditReady =
    !creditRequired ||
    (Boolean(selectedCustomer) && sellOnCredit && canAuthorizeCredit);
  const submitGuard = useRef(false);
  const invoiceMutation = useMutation({
    mutationFn: ({
      acceptPriceChanges = false,
      quote = activeQuote,
    }: { acceptPriceChanges?: boolean; quote?: InvoiceQuote } = {}) =>
      invoicesApi.create({
        checkoutKey,
        locationId,
        customerId: selectedCustomer?.customerId,
        saleType: saleTypeCode,
        details: cart.map((x) => {
          const line = quote?.lines.find(
            (candidate) => Number(candidate.productId) === Number(x.productId),
          );
          return {
            productId: x.productId,
            quantity: x.qty,
            unitPrice: unitPrice(x),
            discountPercentage: line?.discountPercentage ?? 0,
            discountAmount: line?.discountAmount ?? 0,
            quotedPriceListItemId: line?.priceListItemId,
            quotedPriceListItemDiscountId:
              line?.priceListItemDiscountId ?? undefined,
            quotedUnitPrice: line?.unitPrice,
            quotedDiscountAmount: line?.discountAmount,
          };
        }),
        payments: paymentEntries.map((x) => ({
          paymentMethodId: x.paymentMethodId,
          amount: x.amount,
          paymentChannelId: x.paymentChannelId,
          referenceNumber: x.referenceNumber,
        })),
        sellOnCredit: creditRequired && sellOnCredit,
        acceptPriceChanges,
      }),
    onSuccess: (invoice) => {
      setPriceChangeQuote(null);
      setCompletedInvoice(invoice);
      setComplete(true);
    },
    onError: (error) => {
      const details = (error as ApiError).details as
        { code?: string; quote?: InvoiceQuote } | undefined;
      if (details?.code === "PRICE_CHANGED" && details.quote)
        setPriceChangeQuote(details.quote);
    },
    onSettled: () => {
      submitGuard.current = false;
    },
  });
  const clearPaymentDraft = () => {
    setPaid("");
    setPaymentChannelId("");
    setPaymentReference("");
    setEditingPaymentId(null);
    setPaymentValidation({});
  };
  const choosePaymentMethod = (paymentMethod: PaymentMethod) => {
    setPaymentValidation({});
    setPaymentMethodId(paymentMethod.paymentMethodId);
    if (paymentMethod.paymentMethodType !== "CARD") {
      setPaymentChannelId("");
      setPaymentReference("");
    }
  };
  const savePaymentEntry = () => {
    const amount = Number(paid);
    const validation = validatePaymentDraft({
      invoiceTotal: total,
      entries: draftBaseEntries,
      methodType: currentMethod?.paymentMethodType ?? undefined,
      amount,
      channelId: paymentChannelId ? Number(paymentChannelId) : undefined,
      referenceNumber: paymentReference,
    });
    if (
      currentMethod?.paymentMethodType === "CARD" &&
      !(channelsQuery.data ?? []).length
    ) {
      validation.channel =
        "No active card channel is configured for this tenant.";
    }
    if (Object.keys(validation).length) {
      setPaymentValidation(validation);
      return;
    }
    if (!currentMethod?.paymentMethodType) return;
    const entry: PosPaymentEntry = {
      id: editingPaymentId ?? crypto.randomUUID(),
      paymentMethodId: currentMethod.paymentMethodId,
      name: currentMethod.paymentMethodName,
      type: currentMethod.paymentMethodType,
      amount,
      paymentChannelId:
        currentMethod.paymentMethodType === "CARD"
          ? Number(paymentChannelId)
          : undefined,
      channelName:
        currentMethod.paymentMethodType === "CARD"
          ? currentChannel?.name
          : undefined,
      referenceNumber:
        currentMethod.paymentMethodType === "CARD"
          ? paymentReference.trim()
          : undefined,
    };
    const nextEntries = editingPaymentId
      ? paymentEntries.map((row) => (row.id === editingPaymentId ? entry : row))
      : [...paymentEntries, entry];
    const sequenceError = validatePaymentSequence(total, nextEntries);
    if (sequenceError) {
      setPaymentValidation({ form: sequenceError });
      return;
    }
    setPaymentEntries(nextEntries);
    clearPaymentDraft();
  };
  const editPaymentEntry = (entry: PosPaymentEntry) => {
    setEditingPaymentId(entry.id);
    setPaymentMethodId(entry.paymentMethodId);
    setPaid(String(entry.amount));
    setPaymentChannelId(
      entry.paymentChannelId ? String(entry.paymentChannelId) : "",
    );
    setPaymentReference(entry.referenceNumber ?? "");
    setPaymentValidation({});
    setTimeout(() => focusFirst(paymentSection.current), 0);
  };
  const submitSale = (
    options: { acceptPriceChanges?: boolean; quote?: InvoiceQuote } = {},
  ) => {
    if (submitGuard.current || invoiceMutation.isPending) return;
    if (editingPaymentId || paid.trim()) {
      setPaymentValidation({
        form: "Add or cancel the payment being edited before completing the sale.",
      });
      return;
    }
    if (paymentSequenceError) {
      setPaymentValidation({ form: paymentSequenceError });
      return;
    }
    if (creditRequired && !selectedCustomer) {
      setPaymentValidation({
        form: "Select an existing customer before completing a sale with an outstanding balance.",
      });
      return;
    }
    if (creditRequired && !sellOnCredit) {
      setPaymentValidation({
        form: "Explicitly choose Sell on credit before creating the customer receivable.",
      });
      return;
    }
    if (creditRequired && !canAuthorizeCredit) {
      setPaymentValidation({
        form: "Your role does not have SALES_CREDIT_AUTHORIZE permission.",
      });
      return;
    }
    submitGuard.current = true;
    invoiceMutation.mutate(options);
  };
  const changeType = (type: SaleType) => {
    if (type === saleType) return;
    setSaleType(type);
    clearPaymentDraft();
    setPaymentEntries([]);
    setCart((v) =>
      v.map((x) => {
        return {
          ...x,
          discountPct: 0,
          discountRs: 0,
        };
      }),
    );
  };
  const selectTypeWithPlus = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    type: SaleType,
  ) => {
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      return;
    }
    if (event.key === "+" || event.key === "Add") {
      event.preventDefault();
      event.stopPropagation();
      changeType(type);
    }
  };
  const add = (p: Product) => {
    const existingQuantity =
      cart.find((line) => line.code === p.code)?.qty ?? 0;
    if (existingQuantity + 1 > p.stock) return;
    if (!cart.length) setCheckoutKey(crypto.randomUUID());
    clearPaymentDraft();
    setPaymentEntries([]);
    setCart((v) => {
      const found = v.find((x) => x.code === p.code);
      if (!((found?.qty ?? 0) + 1 <= p.stock)) return v;
      if (found) {
        const qty = found.qty + 1;
        const updated = {
          ...found,
          qty,
          discountRs: Number(
            ((qty * unitPrice(found) * found.discountPct) / 100).toFixed(2),
          ),
        };
        return [updated, ...v.filter((x) => x.code !== p.code)];
      }
      return [
        {
          ...p,
          qty: 1,
          discountPct: Number(
            (p as Product & { discountPercentage?: number })
              .discountPercentage ?? 0,
          ),
          discountRs: Number(
            (p as Product & { discountAmount?: number }).discountAmount ?? 0,
          ),
        },
        ...v,
      ];
    });
  };
  const removeOne = (p: Product) => {
    clearPaymentDraft();
    setPaymentEntries([]);
    setCart((v) =>
      v.flatMap((x) => {
        if (x.code !== p.code) return [x];
        if (x.qty <= 1) return [];
        const qty = x.qty - 1;
        return [
          {
            ...x,
            qty,
            discountRs: Number(
              ((qty * unitPrice(x) * x.discountPct) / 100).toFixed(2),
            ),
          },
        ];
      }),
    );
  };
  const update = (
    code: string,
    key: "qty" | "discountPct" | "discountRs",
    value: number,
  ) => {
    clearPaymentDraft();
    setPaymentEntries([]);
    setCart((v) =>
      v.map((x) => {
        if (x.code !== code) return x;
        const safe = Math.max(0, value);
        if (key === "qty") {
          const qty = safe;
          return {
            ...x,
            qty,
            discountRs: Number(
              ((qty * unitPrice(x) * x.discountPct) / 100).toFixed(2),
            ),
          };
        }
        const gross = lineGross(x);
        if (key === "discountPct") {
          const discountPct = Math.min(100, safe);
          return {
            ...x,
            discountPct,
            discountRs: Number(((gross * discountPct) / 100).toFixed(2)),
          };
        }
        const discountRs = Math.min(gross, safe);
        return {
          ...x,
          discountRs,
          discountPct: gross
            ? Number(((discountRs / gross) * 100).toFixed(2))
            : 0,
        };
      }),
    );
  };
  const focusFirst = (section: HTMLDivElement | null) =>
    section?.querySelector<HTMLElement>("button,input,select")?.focus();
  const keepEnterInSection = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const preferred = event.currentTarget.querySelectorAll<HTMLElement>(
      "[data-enter-flow]:not(:disabled)",
    );
    const controls = Array.from(
      preferred.length
        ? preferred
        : event.currentTarget.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),select:not(:disabled)",
          ),
    ).sort(
      (a, b) =>
        Number(a.dataset.flowOrder ?? 0) - Number(b.dataset.flowOrder ?? 0),
    );
    if (!controls.length) return;
    const current = controls.indexOf(document.activeElement as HTMLElement);
    controls[(current + 1) % controls.length].focus();
  };
  const navigateCart = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-cart-cell]",
    );
    if (!target) return;
    const row = Number(target.dataset.cartRow),
      column = Number(target.dataset.cartColumn);
    const focusCell = (nextRow: number, nextColumn: number) =>
      cartSection.current
        ?.querySelector<HTMLElement>(
          `[data-cart-row="${nextRow}"][data-cart-column="${nextColumn}"]`,
        )
        ?.focus();
    if (event.key === "ArrowRight" || event.key === "Enter") {
      event.preventDefault();
      focusCell(
        column === 3 ? Math.min(row + 1, cart.length - 1) : row,
        column === 3 ? 0 : column + 1,
      );
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusCell(
        column === 0 ? Math.max(row - 1, 0) : row,
        column === 0 ? 3 : column - 1,
      );
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusCell(Math.min(row + 1, cart.length - 1), column);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusCell(Math.max(row - 1, 0), column);
    }
    if (
      event.key === "+" ||
      event.key === "Add" ||
      event.key === "-" ||
      event.key === "Subtract"
    ) {
      event.preventDefault();
      const line = cart[row];
      if (!line) return;
      if (column === 3) {
        if (event.key === "+" || event.key === "Add")
          setCart((v) => v.filter((x) => x.code !== line.code));
        return;
      }
      const key =
        column === 0 ? "qty" : column === 1 ? "discountPct" : "discountRs";
      const current = line[key];
      const direction = event.key === "+" || event.key === "Add" ? 1 : -1;
      update(
        line.code,
        key,
        key === "discountPct"
          ? Math.min(100, current + direction)
          : Math.max(0, current + direction),
      );
    }
  };
  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (event.key === "F1") {
        event.preventDefault();
        focusFirst(productSection.current);
      }
      if (event.key === "F2") {
        event.preventDefault();
        focusFirst(saleTypeSection.current);
      }
      if (event.key === "F3") {
        event.preventDefault();
        cartSection.current
          ?.querySelector<HTMLElement>("[data-cart-cell]")
          ?.focus();
      }
      if (event.key === "F4") {
        event.preventDefault();
        customerSection.current?.querySelector<HTMLElement>("input")?.focus();
      }
      if (event.key === "F5") {
        event.preventDefault();
        paymentMethodSection.current
          ?.querySelector<HTMLElement>("[data-payment-method]")
          ?.focus();
      }
      if (event.key === "F6") {
        event.preventDefault();
        focusFirst(paymentSection.current);
      }
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, []);
  const outputReceipt = (printOnly = false) => {
    if (printOnly) window.print();
    else if (completedInvoice) downloadInvoiceReceipt(completedInvoice);
  };
  const resetSale = () => {
    setComplete(false);
    setSaleType("Retail");
    setCart([]);
    setCheckoutKey(crypto.randomUUID());
    setQuery("");
    setCategory("All categories");
    setCustomerQuery("");
    setSelectedCustomer(null);
    setNewCustomer(false);
    setSellOnCredit(false);
    setPaymentMethodId(0);
    setPaid("");
    setPaymentChannelId("");
    setPaymentReference("");
    setPaymentValidation({});
    setPaymentEntries([]);
    setEditingPaymentId(null);
    setCompletedInvoice(null);
    setTimeout(() => focusFirst(productSection.current), 0);
  };
  const navigateReceipt = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const actions = Array.from(
      receiptModal.current?.querySelectorAll<HTMLButtonElement>(
        "[data-receipt-action]",
      ) ?? [],
    );
    const current = actions.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    if (event.key === "Enter") {
      event.preventDefault();
      actions[(current + 1) % actions.length]?.focus();
    }
    if (event.key === "+" || event.key === "Add") {
      event.preventDefault();
      actions[current]?.click();
    }
    if (event.key === " ") {
      event.preventDefault();
    }
  };

  return (
    <div className="pos-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">SALES / POINT OF SALE</div>
          <h1>Billing</h1>
          <p>
            Create a retail or wholesale bill, receive payment and complete the
            sale.
          </p>
        </div>
        <div className="pos-bill-number">
          <small>Current bill</small>
          <strong>{completedInvoice?.invoiceNumber ?? "New invoice"}</strong>
        </div>
      </div>
      <div className="pos-layout">
        <section className="pos-workspace">
          <div className="card billing-location-section">
            <div>
              <h2>Location</h2>
              <p>Select the stock location used for this invoice.</p>
            </div>
            <select
              className="control"
              value={locationId || ""}
              onChange={(event) => {
                setLocationId(Number(event.target.value));
                setCart([]);
                clearPaymentDraft();
                setPaymentEntries([]);
                setCheckoutKey(crypto.randomUUID());
              }}
            >
              <option value="">Select location</option>
              {(locationsQuery.data ?? [])
                .filter((x: any) => x.isActive !== false)
                .map((x: any) => (
                  <option key={x.locationId} value={x.locationId}>
                    {x.name}
                  </option>
                ))}
            </select>
          </div>
          {locationId > 0 && (
            <div
              className={`card pos-session-card ${sessionReady ? "ready" : "blocked"}`}
            >
              <div className="pos-session-summary">
                <div>
                  <small>Terminal</small>
                  <strong>
                    {sessionQuery.data?.terminal
                      ? `${sessionQuery.data.terminal.displayName} (${sessionQuery.data.terminal.terminalCode})`
                      : "Not paired"}
                  </strong>
                </div>
                <div>
                  <small>Location / mode</small>
                  <strong>
                    {sessionQuery.data?.location.name ?? "Checking location"} ·{" "}
                    {sessionQuery.data?.config?.registerMode ===
                    "MASTER_REGISTER"
                      ? "Master register"
                      : sessionQuery.data?.config?.registerMode ===
                          "TERMINAL_REGISTER"
                        ? "Terminal register"
                        : "Unconfigured"}
                  </strong>
                </div>
                <div>
                  <small>Register session</small>
                  <strong>
                    {sessionQuery.data?.registerSession
                      ? `${sessionQuery.data.registerSession.status} · ${sessionQuery.data.registerSession.businessDate}`
                      : "Not open"}
                  </strong>
                </div>
                <div>
                  <small>Cashier session</small>
                  <strong>{sessionReady ? "Active" : "Not active"}</strong>
                </div>
              </div>
              {sessionQuery.isPending ? (
                <p>Checking register session…</p>
              ) : sessionQuery.isError ? (
                <div className="error-box">
                  Unable to verify the POS register session:{" "}
                  {sessionQuery.error.message}
                </div>
              ) : (
                !sessionReady && (
                  <div className="pos-session-action">
                    <div>
                      <strong>Billing blocked</strong>
                      <p>{sessionQuery.data?.blockedReason}</p>
                    </div>
                    {(sessionQuery.data?.action === "OPEN_TERMINAL_REGISTER" ||
                      (sessionQuery.data?.action === "OPEN_MASTER_REGISTER" &&
                        canOpenMasterRegister)) && (
                      <label>
                        Opening balance (LKR)
                        <input
                          className="control"
                          type="number"
                          min="0"
                          step="0.01"
                          value={openingBalance}
                          onChange={(event) => {
                            setOpeningBalance(event.target.value);
                            sessionMutation.reset();
                          }}
                        />
                      </label>
                    )}
                    {sessionQuery.data?.action === "OPEN_TERMINAL_REGISTER" && (
                      <button
                        className="btn btn-primary"
                        disabled={sessionMutation.isPending}
                        onClick={() => sessionMutation.mutate()}
                      >
                        Open register
                      </button>
                    )}
                    {sessionQuery.data?.action === "OPEN_MASTER_REGISTER" &&
                      canOpenMasterRegister && (
                        <button
                          className="btn btn-primary"
                          disabled={sessionMutation.isPending}
                          onClick={() => sessionMutation.mutate()}
                        >
                          Open master register
                        </button>
                      )}
                    {sessionQuery.data?.action === "START_CASHIER_SESSION" && (
                      <button
                        className="btn btn-primary"
                        disabled={sessionMutation.isPending}
                        onClick={() => sessionMutation.mutate()}
                      >
                        Start cashier session
                      </button>
                    )}
                    {sessionQuery.data?.action === "RECOUNT_CASH" && (
                      <button className="btn btn-primary" onClick={() => setCashCountOpen(true)}>
                        Recount cash
                      </button>
                    )}
                    {(sessionQuery.data?.action === "PAIR_TERMINAL" ||
                      sessionQuery.data?.action === "CONFIGURE_LOCATION") && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => navigate("/pos-registers")}
                      >
                        {sessionQuery.data.action === "PAIR_TERMINAL"
                          ? "Pair terminal"
                          : "Configure registers"}
                      </button>
                    )}
                    {sessionQuery.data?.action === "OPEN_MASTER_REGISTER" &&
                      !canOpenMasterRegister && (
                        <small>Requires SALES_REGISTER_OPEN permission.</small>
                      )}
                    {sessionMutation.isError && (
                      <div className="error-box">
                        {sessionMutation.error.message}
                      </div>
                    )}
                  </div>
                )
              )}
              {sessionReady && sessionQuery.data?.config?.registerMode === "TERMINAL_REGISTER" && (
                <div className="pos-session-action">
                  <div><strong>Shift active</strong><p>Count the drawer and submit it for independent verification when the shift ends.</p></div>
                  <button className="btn btn-secondary" onClick={() => setCashCountOpen(true)}>Sign off / Count cash</button>
                </div>
              )}
            </div>
          )}
          {cashCountOpen && (
            <div className="card cash-count-card">
              <div className="sales-card-head"><div><h2>Count cash and sign off</h2><p>Submitting immediately blocks checkout and collections until verification or recount.</p></div></div>
              {cashSummaryQuery.isPending ? <p>Calculating the shift summary...</p> : cashSummaryQuery.isError ? <div className="error-box">{cashSummaryQuery.error.message}</div> : cashSummaryQuery.data && <>
                <div className="cash-summary-grid">
                  <div><small>Opening balance</small><strong>LKR {cashSummaryQuery.data.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
                  <div><small>Cash sales (net)</small><strong>LKR {cashSummaryQuery.data.cash.sales.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
                  <div><small>Cash collections (net)</small><strong>LKR {cashSummaryQuery.data.cash.collections.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
                  <div><small>Cash paid out</small><strong>LKR {cashSummaryQuery.data.cash.paidOut.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
                  <div className="expected"><small>Expected cash</small><strong>LKR {cashSummaryQuery.data.expectedCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
                </div>
                <div className="cash-detail-line">Tendered LKR {cashSummaryQuery.data.cash.received.tendered.toFixed(2)} · Applied LKR {cashSummaryQuery.data.cash.received.applied.toFixed(2)} · Change LKR {cashSummaryQuery.data.cash.received.change.toFixed(2)}</div>
                <div className="pos-session-action">
                  <label>Counted cash (LKR)<input className="control" type="number" min="0" step="0.01" value={countedCash} onChange={(event) => { setCountedCash(event.target.value); submitCashCount.reset(); }} /></label>
                  <button className="btn btn-secondary" onClick={() => setCashCountOpen(false)}>Cancel</button>
                  <button className="btn btn-primary" disabled={submitCashCount.isPending || countedCash === "" || !Number.isFinite(Number(countedCash)) || Number(countedCash) < 0} onClick={() => submitCashCount.mutate()}>{submitCashCount.isPending ? "Submitting..." : "Submit count and sign off"}</button>
                  {submitCashCount.isError && <div className="error-box">{submitCashCount.error.message}</div>}
                </div>
              </>}
            </div>
          )}
          <div
            ref={saleTypeSection}
            onKeyDown={keepEnterInSection}
            className="card sale-type-section"
          >
            <div className="sale-type-heading">
              <span>F2</span>
              <div>
                <h2>Sale Type</h2>
                <p>Enter moves focus · Press + to select the focused type.</p>
              </div>
            </div>
            <div className="sale-type-options">
              <button
                className={saleType === "Retail" ? "active" : ""}
                onKeyDown={(event) => selectTypeWithPlus(event, "Retail")}
                onClick={() => changeType("Retail")}
              >
                <span>▤</span>
                <b>Retail</b>
                <small>Standard selling price</small>
              </button>
              <button
                className={saleType === "Wholesale" ? "active" : ""}
                onKeyDown={(event) => selectTypeWithPlus(event, "Wholesale")}
                onClick={() => changeType("Wholesale")}
              >
                <span>▦</span>
                <b>Wholesale</b>
                <small>Wholesale price + default discount</small>
              </button>
            </div>
            <div className="sale-type-current">
              <small>Selected</small>
              <strong>{saleType} Sale</strong>
            </div>
          </div>
          <div
            ref={productSection}
            onKeyDown={keepEnterInSection}
            className="card pos-product-picker"
          >
            <div className="sales-card-head">
              <div>
                <h2>
                  <span className="section-number">F1</span> Add products
                </h2>
                <p>
                  Press F1 to search · Enter moves directly through the products
                  below.
                </p>
              </div>
            </div>
            <div className="pos-search-row">
              <div className="sales-search">
                <span>⌕</span>
                <input
                  autoFocus
                  data-enter-flow
                  data-flow-order="0"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Enter item code or product name..."
                />
              </div>
              <select
                data-enter-flow
                data-flow-order="1000"
                className="control"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option>All categories</option>
                <option>Bread</option>
                <option>Pastry</option>
                <option>Cake</option>
                <option>Buns</option>
              </select>
              <button
                data-enter-flow
                data-flow-order="1001"
                className="btn btn-secondary"
                onClick={() => {
                  setQuery("");
                  setCategory("All categories");
                }}
              >
                Clear
              </button>
            </div>
            {query.trim() || category !== "All categories" ? (
              <div className="pos-product-results">
                {products
                  .filter(
                    (x) =>
                      (category === "All categories" ||
                        x.category === category) &&
                      `${x.code} ${x.name}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                  )
                  .map((p, index) => {
                    const quantity =
                      cart.find((x) => x.code === p.code)?.qty ?? 0;
                    const available = Math.max(0, p.stock - quantity);
                    const canAdd = available >= 1;
                    return (
                      <div
                        data-enter-flow
                        data-flow-order={10 + index}
                        tabIndex={0}
                        onClick={() => add(p)}
                        onKeyDown={(event) => {
                          if (event.key === "+" || event.key === "Add") {
                            event.preventDefault();
                            event.stopPropagation();
                            add(p);
                          }
                          if (event.key === "-" || event.key === "Subtract") {
                            event.preventDefault();
                            event.stopPropagation();
                            removeOne(p);
                          }
                        }}
                        className="pos-product-item"
                        key={p.code}
                      >
                        <span className="product-dot">{p.name[0]}</span>
                        <span>
                          <strong>{p.name}</strong>
                          <small>
                            {p.code} · {p.category} · {available} available
                          </small>
                        </span>
                        <span className="product-sale-price">
                          <b>LKR {unitPrice(p).toLocaleString()}</b>
                          <small>
                            {quantity ? `${quantity} in cart · ` : ""}
                            {canAdd
                              ? "Click or keyboard + / −"
                              : "No more available"}
                          </small>
                        </span>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="product-search-empty">
                <span>⌕</span>
                <strong>Find a product to begin</strong>
                <small>
                  Enter an item code, product name, or select a category.
                </small>
              </div>
            )}
          </div>
          <div
            ref={cartSection}
            onKeyDown={navigateCart}
            className="card pos-cart"
          >
            <div className="sales-card-head">
              <div>
                <h2>
                  <span className="section-number">F3</span> Sale items{" "}
                  <span className="code-chip">{cart.length} items</span>
                </h2>
                <p>
                  Arrow keys move around items · Enter moves next · + / −
                  changes values.
                </p>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setCart([]);
                  clearPaymentDraft();
                  setPaymentEntries([]);
                  setCheckoutKey(crypto.randomUUID());
                }}
              >
                Clear cart
              </button>
            </div>
            <div className="sales-table-wrap">
              <table className="table pos-cart-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Item code</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th className="right">Price</th>
                    <th>Discount (%)</th>
                    <th>Discount (Rs)</th>
                    <th className="right">Gross Total</th>
                    <th className="right">Net Total</th>
                    <th>Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((x, i) => (
                    <tr key={x.code}>
                      <td>{i + 1}</td>
                      <td>
                        <span className="code-chip">{x.code}</span>
                      </td>
                      <td>
                        <strong>{x.name}</strong>
                      </td>
                      <td>
                        <input
                          data-cart-cell
                          data-cart-row={i}
                          data-cart-column="0"
                          className="control pos-small-input"
                          type="number"
                          min="0"
                          value={x.qty || ""}
                          placeholder="0"
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) =>
                            update(
                              x.code,
                              "qty",
                              e.target.value === "" ? 0 : +e.target.value,
                            )
                          }
                        />
                      </td>
                      <td className="right">{unitPrice(x).toLocaleString()}</td>
                      <td>
                        <input
                          data-cart-cell
                          data-cart-row={i}
                          data-cart-column="1"
                          className="control pos-small-input"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={quotedLine(x)?.discountPercentage || ""}
                          placeholder="0"
                          disabled
                          aria-label="Server product discount percentage"
                        />
                      </td>
                      <td>
                        <input
                          data-cart-cell
                          data-cart-row={i}
                          data-cart-column="2"
                          className="control pos-discount-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={lineDiscount(x) || ""}
                          placeholder="0.00"
                          disabled
                          aria-label="Server product discount amount"
                        />
                      </td>
                      <td className="right">{lineGross(x).toLocaleString()}</td>
                      <td className="right">
                        <strong>LKR {lineNet(x).toLocaleString()}</strong>
                      </td>
                      <td>
                        <button
                          data-cart-cell
                          data-cart-row={i}
                          data-cart-column="3"
                          className="sales-more cart-remove"
                          onClick={() => {
                            setCart((v) => v.filter((y) => y.code !== x.code));
                            clearPaymentDraft();
                            setPaymentEntries([]);
                          }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!cart.length && (
                <div className="empty">
                  No items in this sale. Select a product above.
                </div>
              )}
            </div>
          </div>
        </section>
        <aside className="pos-checkout">
          <div
            ref={customerSection}
            onKeyDown={keepEnterInSection}
            className="card pos-customer"
          >
            <div className="pos-panel-title">
              <h2>
                <span className="panel-shortcut">F4</span> Customer
              </h2>
              <div className="customer-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setNewCustomer(true);
                    setSelectedCustomer(null);
                    setSellOnCredit(false);
                    setCustomerQuery("");
                  }}
                >
                  + New
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setNewCustomer(false);
                    setSelectedCustomer(null);
                    setSellOnCredit(false);
                    setCustomerQuery("");
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
            <label className="customer-search-label">
              Customer Code / Tel / Name
            </label>
            <div className="sales-search customer-search">
              <span>⌕</span>
              <input
                value={customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  setSelectedCustomer(null);
                  setSellOnCredit(false);
                  setNewCustomer(false);
                }}
                placeholder="Search customer..."
              />
            </div>
            {customerQuery && !selectedCustomer && (
              <div className="customer-results">
                {customers
                  .filter((x) =>
                    `${x.code} ${x.phone} ${x.name}`
                      .toLowerCase()
                      .includes(customerQuery.toLowerCase()),
                  )
                  .map((x) => (
                    <button
                      key={x.code}
                      onClick={() => {
                        setSelectedCustomer(x);
                        setSellOnCredit(false);
                        setCustomerQuery(x.code);
                      }}
                    >
                      <span>
                        <strong>{x.name}</strong>
                        <small>
                          {x.code} · {x.phone}
                        </small>
                      </span>
                      <b>+</b>
                    </button>
                  ))}
              </div>
            )}
            {selectedCustomer && (
              <div className="selected-customer">
                <span>{selectedCustomer.name[0]}</span>
                <div>
                  <strong>{selectedCustomer.name}</strong>
                  <small>
                    {selectedCustomer.code} · {selectedCustomer.phone}
                  </small>
                </div>
              </div>
            )}
            {newCustomer && (
              <div className="pos-customer-fields new-customer-fields">
                <input className="control" placeholder="Customer code" />
                <input className="control" placeholder="Telephone" />
                <input
                  className="control customer-name-field"
                  placeholder="Customer name"
                />
              </div>
            )}
          </div>
          <BillingLoyaltyArea customerId={selectedCustomer?.customerId} />
          <div
            ref={paymentSection}
            onKeyDown={keepEnterInSection}
            className="card pos-payment pos-checkout-card"
          >
            <div className="pos-panel-title">
              <h2>Checkout</h2>
              <span
                className={`checkout-status ${paymentStatus.toLowerCase().replace(" ", "-")}`}
              >
                {paymentStatus}
              </span>
            </div>
            <div className="checkout-summary">
              <h3>Cart summary</h3>
              <div className="summary-line">
                <span>Items</span>
                <b>{cart.reduce((n, x) => n + x.qty, 0)} units</b>
              </div>
              <div className="summary-line">
                <span>Subtotal</span>
                <b>LKR {subtotal.toLocaleString()}</b>
              </div>
              <div className="summary-line">
                <span>Discounts</span>
                <b>- LKR {discount.toLocaleString()}</b>
              </div>
              <div className="summary-total">
                <span>Invoice total</span>
                <strong>LKR {total.toLocaleString()}</strong>
              </div>
            </div>
            <div className="checkout-payments-head">
              <h3>Payments</h3>
              <span>{paymentEntries.length} added</span>
            </div>
            {paymentEntries.length ? (
              <div className="split-payment-list">
                {paymentEntries.map((payment, index) => {
                  const previousChange = summarizePaymentEntries(
                    total,
                    paymentEntries.slice(0, index),
                  ).change;
                  const rowChange =
                    summarizePaymentEntries(
                      total,
                      paymentEntries.slice(0, index + 1),
                    ).change - previousChange;
                  return (
                    <div
                      className={
                        editingPaymentId === payment.id ? "editing" : ""
                      }
                      key={payment.id}
                    >
                      <span>
                        <strong>{payment.name}</strong>
                        <small>
                          {payment.channelName
                            ? `${payment.channelName} · `
                            : ""}
                          {payment.referenceNumber ||
                            (payment.type === "CASH"
                              ? `Tendered LKR ${payment.amount.toLocaleString()}`
                              : payment.type)}
                        </small>
                      </span>
                      <b>
                        LKR {payment.amount.toLocaleString()}
                        {rowChange > 0 && (
                          <small>Change {rowChange.toLocaleString()}</small>
                        )}
                      </b>
                      <span className="payment-row-actions">
                        <button
                          type="button"
                          aria-label={`Edit ${payment.name} payment`}
                          onClick={() => editPaymentEntry(payment)}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${payment.name} payment`}
                          onClick={() => {
                            setPaymentEntries((rows) =>
                              rows.filter((row) => row.id !== payment.id),
                            );
                            if (editingPaymentId === payment.id)
                              clearPaymentDraft();
                          }}
                        >
                          ×
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="checkout-empty-payment">
                No payments added. The invoice may still be completed with an
                outstanding balance.
              </p>
            )}

            <div ref={paymentMethodSection} className="add-payment-panel">
              <div className="add-payment-title">
                <h3>
                  <span className="panel-shortcut">F5</span> Add payment
                </h3>
                {editingPaymentId && (
                  <button type="button" onClick={clearPaymentDraft}>
                    Cancel edit
                  </button>
                )}
              </div>
              <div className="pos-methods">
                {paymentMethods.map((x) => (
                  <button
                    type="button"
                    data-enter-flow
                    data-payment-method
                    className={
                      paymentMethodId === x.paymentMethodId ? "active" : ""
                    }
                    onKeyDown={(event) => {
                      if (event.key === "+" || event.key === "Add") {
                        event.preventDefault();
                        event.stopPropagation();
                        choosePaymentMethod(x);
                      }
                      if (event.key === " ") event.preventDefault();
                    }}
                    onClick={() => choosePaymentMethod(x)}
                    key={x.paymentMethodId}
                  >
                    <span>
                      {x.paymentMethodType === "CASH"
                        ? "◉"
                        : x.paymentMethodType === "CARD"
                          ? "▣"
                          : "◇"}
                    </span>
                    <b>{x.paymentMethodName}</b>
                    <small>{x.paymentMethodType}</small>
                  </button>
                ))}
              </div>
              {paymentValidation.method && (
                <small className="field-error">
                  {paymentValidation.method}
                </small>
              )}
              {!methodsQuery.isPending && !paymentMethods.length && (
                <div className="error-box">
                  No active classified payment method is configured. Classify
                  legacy methods or add a payment method first.
                </div>
              )}
              {currentMethod?.paymentMethodType === "CARD" && (
                <div className="card-payment-fields">
                  <label>
                    Card channel
                    <select
                      data-enter-flow
                      className={
                        paymentValidation.channel
                          ? "control invalid"
                          : "control"
                      }
                      value={paymentChannelId}
                      onChange={(event) => {
                        setPaymentChannelId(event.target.value);
                        setPaymentValidation((errors) => ({
                          ...errors,
                          channel: undefined,
                        }));
                      }}
                    >
                      <option value="">Choose acquiring bank</option>
                      {(channelsQuery.data ?? []).map((channel) => (
                        <option
                          key={channel.paymentChannelId}
                          value={channel.paymentChannelId}
                        >
                          {channel.name}
                        </option>
                      ))}
                    </select>
                    {paymentValidation.channel && (
                      <small className="field-error">
                        {paymentValidation.channel}
                      </small>
                    )}
                  </label>
                  <label>
                    Approval / transaction reference
                    <input
                      data-enter-flow
                      className={
                        paymentValidation.reference
                          ? "control invalid"
                          : "control"
                      }
                      maxLength={100}
                      value={paymentReference}
                      onChange={(event) => {
                        setPaymentReference(event.target.value);
                        setPaymentValidation((errors) => ({
                          ...errors,
                          reference: undefined,
                        }));
                      }}
                      placeholder="External approval reference"
                    />
                    {paymentValidation.reference && (
                      <small className="field-error">
                        {paymentValidation.reference}
                      </small>
                    )}
                  </label>
                </div>
              )}
              <div className="payment-amount-row">
                <label>
                  Amount (LKR)
                  <div className="money-input">
                    <span>LKR</span>
                    <input
                      data-enter-flow
                      className={
                        paymentValidation.amount ? "control invalid" : "control"
                      }
                      type="number"
                      min="0"
                      step="0.01"
                      value={paid}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => {
                        setPaid(e.target.value);
                        setPaymentValidation((errors) => ({
                          ...errors,
                          amount: undefined,
                          form: undefined,
                        }));
                      }}
                      placeholder="0.00"
                    />
                  </div>
                  {paymentValidation.amount && (
                    <small className="field-error">
                      {paymentValidation.amount}
                    </small>
                  )}
                </label>
                <button
                  data-enter-flow
                  type="button"
                  className="btn btn-secondary add-payment-button"
                  disabled={!paymentMethods.length || invoiceMutation.isPending}
                  onClick={savePaymentEntry}
                >
                  {editingPaymentId ? "Update payment" : "Add payment"}
                </button>
              </div>
            </div>

            <div className="checkout-balance">
              <div>
                <span>Total tendered</span>
                <b>LKR {paymentSummary.tendered.toLocaleString()}</b>
              </div>
              <div>
                <span>Total collected (net)</span>
                <b>LKR {paymentSummary.netReceived.toLocaleString()}</b>
              </div>
              <div>
                <span>Applied to invoice</span>
                <b>LKR {paymentSummary.applied.toLocaleString()}</b>
              </div>
              <div className="remaining">
                <span>Remaining balance</span>
                <strong>LKR {paymentSummary.remaining.toLocaleString()}</strong>
              </div>
              <div>
                <span>Cash change</span>
                <b>LKR {paymentSummary.change.toLocaleString()}</b>
              </div>
            </div>
            {creditRequired && (
              <div
                className={`credit-decision ${creditReady ? "ready" : "attention"}`}
              >
                <div>
                  <strong>Customer credit</strong>
                  <span>
                    LKR {paymentSummary.remaining.toLocaleString()} will remain
                    outstanding
                    {selectedCustomer
                      ? ` for ${selectedCustomer.name}`
                      : ". Select an existing customer."}
                  </span>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={sellOnCredit}
                    disabled={!selectedCustomer || !canAuthorizeCredit}
                    onChange={(event) => {
                      setSellOnCredit(event.target.checked);
                      setPaymentValidation((errors) => ({
                        ...errors,
                        form: undefined,
                      }));
                    }}
                  />
                  Sell on credit
                </label>
                {!canAuthorizeCredit && (
                  <small>Requires SALES_CREDIT_AUTHORIZE permission.</small>
                )}
              </div>
            )}
            <div className="payment-finish">
              <button
                className="pos-complete"
                disabled={
                  !cart.length ||
                  !locationId ||
                  invoiceMutation.isPending ||
                  quoteQuery.isPending ||
                  quoteQuery.isError ||
                  !activeQuote ||
                  !creditReady ||
                  !sessionReady ||
                  Boolean(
                    editingPaymentId || paid.trim() || paymentSequenceError,
                  )
                }
                onClick={() => submitSale()}
              >
                ✓ Complete sale
              </button>
            </div>
            {quoteQuery.isError && (
              <div className="error-box">
                Unable to confirm current prices: {quoteQuery.error.message}
              </div>
            )}
            {paymentValidation.form && (
              <div className="error-box">{paymentValidation.form}</div>
            )}
            {paymentSequenceError && !paymentValidation.form && (
              <div className="error-box">{paymentSequenceError}</div>
            )}
            {priceChangeQuote && (
              <div className="error-box">
                <strong>Prices changed while this cart was open.</strong>
                <div>
                  Review the updated cart totals, then confirm to finalize using
                  the current prices.
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={invoiceMutation.isPending}
                  onClick={() =>
                    submitSale({
                      acceptPriceChanges: true,
                      quote: priceChangeQuote,
                    })
                  }
                >
                  Accept updated prices
                </button>
              </div>
            )}
            {invoiceMutation.isError && !priceChangeQuote && (
              <div className="error-box">
                {(invoiceMutation.error as Error).message}
              </div>
            )}
          </div>
        </aside>
      </div>
      {complete && (
        <div className="modal-bg">
          <div
            ref={receiptModal}
            onKeyDown={navigateReceipt}
            className="modal pos-success"
          >
            <button
              data-receipt-action
              className="receipt-close"
              onClick={resetSale}
              aria-label="Close receipt and reset sale"
            >
              ✕
            </button>
            <span>✓</span>
            <h2>Sale completed</h2>
            <p>
              {completedInvoice?.invoiceNumber} · {saleType} ·{" "}
              {paymentEntries.map((entry) => entry.name).join(" + ") ||
                "Unpaid"}{" "}
              · LKR {total.toLocaleString()}
            </p>
            {completedInvoice && (
              <InvoiceReceiptContent invoice={completedInvoice} />
            )}
            <div className="modal-foot receipt-actions">
              {Number(completedInvoice?.balanceAmount ?? 0) > 0 &&
                hasPermission("SALES_PAYMENT_COLLECT") && (
                  <button
                    data-receipt-action
                    className="btn btn-primary"
                    onClick={() => {
                      resetSale();
                      navigate("/pending-payments");
                    }}
                  >
                    Collect balance later
                  </button>
                )}
              <button
                autoFocus
                data-receipt-action
                className="btn btn-secondary"
                onClick={() => outputReceipt(true)}
              >
                ▣ Print Receipt
              </button>
              <button
                data-receipt-action
                className="btn btn-secondary"
                onClick={() => outputReceipt(false)}
              >
                ⇩ Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
