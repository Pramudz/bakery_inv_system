import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { customersApi } from "../../customers/api/customersApi";
import { InvoiceQuote, invoicesApi } from "../api/invoicesApi";
import { InvoiceReceiptContent } from "./InvoiceReceiptContent";
import { requestCompletionPrint } from "./completionPrint";
import { posPrintStatusApi } from "../api/posPrintStatusApi";
import { downloadInvoiceReceipt } from "./invoiceReceiptPdf";
import { saleBillReference } from "./saleBillReference";
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
import { billingDraftKey, readBillingDraft, removeBillingDraft, writeBillingDraft } from "../billingDraftStorage";
import { quotationsApi } from "../api/quotationsApi";
import { filterPosProducts } from "../posProductSearch";
import { canCompleteSale, conversionMatchesCheckout } from "./billingCheckoutEligibility";
import { billingCheckoutDetail } from "./billingCheckoutDetails";
import "./billing-register-session.css";
import "./quotations.css";

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
  const [searchParams] = useSearchParams();
  const sourceQuotationId = Number(searchParams.get('quotationId') || 0);
  const conversionQuery = useQuery({ queryKey: ['quotation-conversion', sourceQuotationId], queryFn: () => quotationsApi.posPreview(sourceQuotationId), enabled: sourceQuotationId > 0, retry: false, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const conversion = conversionQuery.data;
  const { permissions, role, tenant, tenantUser } = useAuth();
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
  const [checkoutKey, setCheckoutKey] = useState<string>(() => crypto.randomUUID());
  const [paymentEntries, setPaymentEntries] = useState<PosPaymentEntry[]>([]);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [completedInvoice, setCompletedInvoice] = useState<Record<
    string,
    any
  > | null>(null);
  const [printPending, setPrintPending] = useState(false);
  const [printError, setPrintError] = useState('');
  const [printNotice, setPrintNotice] = useState('');
  const printLock = useRef(false);
  const salePrintStatus = useQuery({ queryKey: ['pos-print-status', 'SALE', completedInvoice?.invoiceId],
    queryFn: () => posPrintStatusApi.get('SALE', Number(completedInvoice!.invoiceId)),
    enabled: Boolean(completedInvoice?.invoiceId),
    refetchInterval: (query) => ['PENDING', 'CLAIMED'].includes(query.state.data?.status ?? '') ? 3000 : false });
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
  useEffect(() => {
    const first = (locationsQuery.data ?? []).find(
      (x: any) => x.isActive !== false,
    );
    if (!sourceQuotationId && !locationId && first) setLocationId(Number(first.locationId));
  }, [locationsQuery.data, locationId, sourceQuotationId]);
  const draftKey = tenant?.tenantId && tenantUser?.userId && locationId
    ? billingDraftKey(tenant.tenantId, tenantUser.userId, locationId)
    : null;
  const hydratedDraftKey = useRef<string | null>(null);
  const skipDraftWrite = useRef(false);
  useEffect(() => {
    if (sourceQuotationId || !draftKey || hydratedDraftKey.current === draftKey) return;
    skipDraftWrite.current = true;
    hydratedDraftKey.current = draftKey;
    const draft = readBillingDraft(localStorage, draftKey);
    setComplete(false);
    setCompletedInvoice(null);
    setSaleType(draft?.saleType ?? "Retail");
    setCart((draft?.cart as CartLine[] | undefined) ?? []);
    setSelectedCustomer((draft?.selectedCustomer as CustomerOption | null | undefined) ?? null);
    setSellOnCredit(draft?.sellOnCredit ?? false);
    setPaymentEntries(draft?.paymentEntries ?? []);
    setCheckoutKey(draft?.checkoutKey ?? crypto.randomUUID());
    clearPaymentDraft();
  }, [draftKey, sourceQuotationId]);
  useEffect(() => {
    if (sourceQuotationId || !draftKey || hydratedDraftKey.current !== draftKey) return;
    if (skipDraftWrite.current) { skipDraftWrite.current = false; return; }
    if (complete) { removeBillingDraft(localStorage, draftKey); return; }
    writeBillingDraft(localStorage, draftKey, { checkoutKey, saleType, cart, selectedCustomer, sellOnCredit, paymentEntries });
  }, [draftKey, checkoutKey, saleType, cart, selectedCustomer, sellOnCredit, paymentEntries, complete, sourceQuotationId]);
  useEffect(() => {
    if (!conversion) return;
    setLocationId(Number(conversion.locationId));
    setSaleType(conversion.quotationType === 'WHOLESALE' ? 'Wholesale' : 'Retail');
    setSelectedCustomer({ customerId: Number(conversion.customerId), code: conversion.customerCodeSnapshot, name: conversion.customerNameSnapshot, phone: conversion.customerPhoneSnapshot || '' });
    setCustomerQuery(conversion.customerCodeSnapshot);
    setNewCustomer(false);
    setSellOnCredit(false);
    setComplete(false);
    setCompletedInvoice(null);
    setPriceChangeQuote(null);
    setCart(conversion.lines.map(line => ({ productId: Number(line.productId), code: line.productCodeSnapshot, name: line.productNameSnapshot, category: '', retailPrice: Number(line.unitPrice), wholesalePrice: Number(line.unitPrice), stock: Number.MAX_SAFE_INTEGER, qty: Number(line.quantity), discountPct: Number(line.discountPercent), discountRs: Number(line.discountAmount) })));
    setCheckoutKey(crypto.randomUUID());
    setPaymentEntries([]);
  }, [conversion]);
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
      !sourceQuotationId && locationId > 0 && cart.length > 0 && cart.every((line) => line.qty > 0),
    retry: false,
  });
  useEffect(() => {
    setPriceChangeQuote(null);
  }, [locationId, saleTypeCode, cart]);
  const conversionPrice: InvoiceQuote | undefined = conversion ? { quotedAt: '', locationId: Number(conversion.locationId), saleType: conversion.quotationType, subtotal: Number(conversion.subtotal), discountTotal: Number(conversion.discountTotal), grandTotal: Number(conversion.grandTotal), lines: conversion.lines.map(line => ({ productId: Number(line.productId), productUnitId: null, priceListId: null, priceListItemId: null, priceListItemDiscountId: null, discountType: null, discountValue: null, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), discountPerUnit: Number(line.discountAmount) / Number(line.quantity), discountPercentage: Number(line.discountPercent), grossTotal: Number(line.grossTotal), discountAmount: Number(line.discountAmount), netTotal: Number(line.netTotal), currencyCode: 'LKR' })) } : undefined;
  const activeQuote = sourceQuotationId > 0
    ? conversionPrice
    : priceChangeQuote ?? quoteQuery.data;
  const conversionReady = conversionMatchesCheckout(
    conversion,
    sourceQuotationId,
    locationId,
    selectedCustomer?.customerId,
    saleTypeCode,
    cart,
  );
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
  const sessionReady = sessionQuery.data?.canBill === true;
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
        sourceQuotationId: sourceQuotationId || undefined,
        locationId,
        customerId: selectedCustomer?.customerId,
        saleType: saleTypeCode,
        details: cart.map((x) => {
          const line = quote?.lines.find(
            (candidate) => Number(candidate.productId) === Number(x.productId),
          );
          return billingCheckoutDetail(
            x.productId, x.qty, unitPrice(x), line, sourceQuotationId,
          );
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
      if (draftKey) removeBillingDraft(localStorage, draftKey);
      setPrintNotice('');
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
  const checkoutReady = canCompleteSale({
    sourceQuotationId,
    conversionReady,
    cartReady: cart.length > 0,
    locationReady: locationId > 0,
    checkoutPending: invoiceMutation.isPending,
    quotePending: quoteQuery.isPending,
    quoteError: quoteQuery.isError,
    hasActiveQuote: Boolean(activeQuote),
    creditReady,
    sessionReady,
    paymentEntryPending: Boolean(editingPaymentId || paid.trim() || paymentSequenceError),
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
    if (submitGuard.current || invoiceMutation.isPending || (sourceQuotationId > 0 && !conversion)) return;
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
    if (sourceQuotationId) return;
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
    if (sourceQuotationId) return;
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
  const outputReceipt = async (printOnly = false) => {
    if (!completedInvoice) return;
    if (!printOnly) { downloadInvoiceReceipt(completedInvoice); return; }
    await requestCompletionPrint(printLock, () => posPrintStatusApi.print('SALE', Number(completedInvoice.invoiceId)), {
      pending: setPrintPending, error: setPrintError,
      accepted: () => { setPrintNotice('Print request accepted. Waiting for the printer.'); resetSale(); },
    });
  };
  const resetSale = () => {
    if (sourceQuotationId) { navigate(`/quotations/${sourceQuotationId}`); return; }
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
    <div className={`pos-page${sourceQuotationId ? ' quotation-conversion' : ''}`}>
      {sourceQuotationId > 0 && <div className="card quotation-conversion-banner"><div><strong>{conversion ? `Converting ${conversion.quotationNumber}` : 'Loading quotation…'}</strong><p>{conversion ? `${conversion.customerNameSnapshot} · ${conversion.locationNameSnapshot}. Quoted items, quantities and prices are locked. Complete payment through this POS checkout.` : conversionQuery.error?.message || 'Preparing accepted quotation.'}</p></div><button className="btn btn-secondary" onClick={() => navigate(conversion ? `/quotations/${conversion.quotationId}` : '/quotations')}>Cancel conversion</button></div>}
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
          <strong>{completedInvoice ? saleBillReference(completedInvoice) : "New bill"}</strong>
        </div>
      </div>
      {printNotice && <div className="success-box" role="status">{printNotice}</div>}
      <div className="pos-layout">
        <section className="pos-workspace">
          <div className="card billing-location-section">
            <div>
              <h2>Location</h2>
              <p>Select the stock location used for this invoice.</p>
            </div>
            <select
              className="control"
              disabled={sourceQuotationId > 0}
              value={locationId || ""}
              onChange={(event) => {
                setLocationId(Number(event.target.value));
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
            <div className={`card pos-session-card ${sessionReady ? "ready" : "blocked"}`}>
              <div className="pos-session-summary">
                <div><small>Location / mode</small><strong>{sessionQuery.data?.location.name ?? "Checking location"} · {sessionQuery.data?.config?.registerMode === "MASTER_REGISTER" ? "Master register" : sessionQuery.data?.config?.registerMode === "TERMINAL_REGISTER" ? "Terminal register" : "Unconfigured"}</strong></div>
                <div><small>Paired terminal</small><strong>{sessionQuery.data?.terminal ? `${sessionQuery.data.terminal.displayName} (${sessionQuery.data.terminal.terminalCode})` : "Not paired"}</strong></div>
                <div><small>Register</small><strong>{sessionQuery.data?.registerSession ? `${sessionQuery.data.registerSession.status} · ${sessionQuery.data.registerSession.businessDate}` : "Not open"}</strong></div>
                <div><small>Cashier session</small><strong>{sessionQuery.data?.cashierSession?.status ?? "Not active"}</strong></div>
              </div>
              <div className="pos-session-action">
                <div><strong>{sessionReady ? "Ready for billing" : "Billing blocked"}</strong><p>{sessionReady ? "This device and signed-in cashier have an active session." : sessionQuery.data?.blockedReason ?? (sessionQuery.isPending ? "Checking register status…" : sessionQuery.error?.message)}</p></div>
                <button className="btn btn-secondary" onClick={() => navigate(`/pos-register-management?locationId=${locationId}&tab=overview`)}>Manage register</button>
              </div>
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
                disabled={sourceQuotationId > 0}
                onKeyDown={(event) => selectTypeWithPlus(event, "Retail")}
                onClick={() => changeType("Retail")}
              >
                <span>▤</span>
                <b>Retail</b>
                <small>Standard selling price</small>
              </button>
              <button
                className={saleType === "Wholesale" ? "active" : ""}
                disabled={sourceQuotationId > 0}
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
          {!sourceQuotationId && <div
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
                {filterPosProducts(products, query, category)
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
          </div>}
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
                disabled={sourceQuotationId > 0}
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
                          disabled={sourceQuotationId > 0}
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
                          disabled={sourceQuotationId > 0}
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
                  disabled={sourceQuotationId > 0}
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
                  disabled={sourceQuotationId > 0}
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
                disabled={sourceQuotationId > 0}
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
                disabled={!checkoutReady}
                onClick={() => submitSale()}
              >
                ✓ Complete sale
              </button>
            </div>
            {!sourceQuotationId && quoteQuery.isError && (
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
              {saleBillReference(completedInvoice)} · {saleType} ·{" "}
              {paymentEntries.map((entry) => entry.name).join(" + ") ||
                "Unpaid"}{" "}
              · LKR {total.toLocaleString()}
            </p>
            {completedInvoice && (
              <InvoiceReceiptContent invoice={completedInvoice} />
            )}
            {printError && <div className="error-box" role="alert">{printError}</div>}
            {salePrintStatus.data?.status !== 'NOT_REQUESTED' && salePrintStatus.data && <p role="status">{salePrintStatus.data.status === 'PRINTED' ? 'Sent to printer.' : salePrintStatus.data.status === 'FAILED' ? `Print failed: ${salePrintStatus.data.lastError ?? 'Check the printer.'}` : 'Sending to printer...'}</p>}
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
                disabled={printPending || !completedInvoice?.receiptSnapshot}
                onClick={() => void outputReceipt(true)}
              >
                {printPending ? 'Sending to printer...' : 'Print'}
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
