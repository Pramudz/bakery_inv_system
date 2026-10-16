import { linkedRetailDiscount, cartFocusTarget, cartLineGross } from "./retailCartEditing";
import type { InvoiceQuoteLine } from "../api/invoicesApi";
import type { RetailDiscount } from "./retailCartEditing";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { customersApi } from "../../customers/api/customersApi";
import { QuickCreateCustomerDialog } from '../../customers/components/QuickCreateCustomerDialog';
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
import { BillingIcon } from '../components/BillingIcon';
import { BillingHeader } from '../components/BillingHeader';
import { selectBillingShortcuts } from '../billingShortcuts';
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
import './billing-page.css';

type SaleType = "Retail" | "Wholesale";
type Product = {
  productId: number;
  code: string;
  category: string;
  name: string;
  retailPrice: number;
  wholesalePrice: number;
  stock: number;
  pricing?: InvoiceQuoteLine;
};
type CartLine = Product & {
  qty: number;
  discountPct: number;
  discountRs: number;
  retailDiscount?: RetailDiscount;
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
  const completeSaleButton = useRef<HTMLButtonElement>(null);
  const clearCartButton = useRef<HTMLButtonElement>(null);
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
  const [billDiscount, setBillDiscount] = useState<{ type: 'PERCENTAGE' | 'FIXED'; value: string }>({ type: 'PERCENTAGE', value: '0' });
  const [billDiscountOpen, setBillDiscountOpen] = useState(false);
  const [paymentReviewRequired, setPaymentReviewRequired] = useState(false);
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
    setBillDiscount(draft?.billDiscount ?? { type: 'PERCENTAGE', value: '0' });
    setPaymentReviewRequired(Boolean(draft?.billDiscount && draft.paymentEntries.length));
    setCheckoutKey(draft?.checkoutKey ?? crypto.randomUUID());
    clearPaymentDraft();
  }, [draftKey, sourceQuotationId]);
  useEffect(() => {
    if (sourceQuotationId || !draftKey || hydratedDraftKey.current !== draftKey) return;
    if (skipDraftWrite.current) { skipDraftWrite.current = false; return; }
    if (complete) { removeBillingDraft(localStorage, draftKey); return; }
    writeBillingDraft(localStorage, draftKey, { checkoutKey, saleType, cart, selectedCustomer, sellOnCredit, paymentEntries, billDiscount });
  }, [draftKey, checkoutKey, saleType, cart, selectedCustomer, sellOnCredit, paymentEntries, billDiscount, complete, sourceQuotationId]);
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
    setBillDiscount({ type: 'PERCENTAGE', value: '0' });
  }, [conversion]);
  const lastPricing = useRef(new Map<string, InvoiceQuoteLine>());
  const retailEditable = saleType === "Retail" && !sourceQuotationId;
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
      phone: x.mobile || x.phone || "",
    }));
  const shortcutsQuery = useQuery({ queryKey: ['billing-shortcuts', locationId],
    queryFn: () => invoicesApi.billingShortcuts(locationId), enabled: locationId > 0 && !sourceQuotationId,
    staleTime: 60000, retry: false });
  const quickShortcuts = selectBillingShortcuts(products,
    shortcutsQuery.data && Array.isArray(shortcutsQuery.data.productIds) ? shortcutsQuery.data : undefined);
  const categoryOptions = useMemo(() => [...new Set((catalogQuery.data ?? []).map(product => product.category).filter(Boolean))].sort(), [catalogQuery.data]);
  const visibleProducts = filterPosProducts(products, query, category);
  const visibleQuickItems = selectBillingShortcuts(visibleProducts,
    shortcutsQuery.data && Array.isArray(shortcutsQuery.data.productIds) ? shortcutsQuery.data : undefined).items;
  useEffect(() => { setCategory('All categories'); }, [locationId, saleTypeCode]);
  useEffect(() => {
    if (catalogQuery.isSuccess && category !== 'All categories' && !categoryOptions.includes(category)) setCategory('All categories');
  }, [catalogQuery.isSuccess, categoryOptions, category]);
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
      cart.map((line) => [line.productId, line.qty, retailEditable ? line.retailDiscount : undefined]),
    ],
    queryFn: () =>
      invoicesApi.quote({
        locationId,
        saleType: saleTypeCode,
        details: cart.map((line) => ({
          productId: line.productId,
          quantity: line.qty,
          ...(retailEditable && line.retailDiscount ? { retailDiscount: line.retailDiscount } : {}),
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
  useEffect(() => {
    if (sourceQuotationId) return;
    for (const line of activeQuote?.lines ?? []) lastPricing.current.set(`${locationId}:${saleTypeCode}:${line.productId}`, line);
  }, [activeQuote, locationId, saleTypeCode, sourceQuotationId]);
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
  const pricingForLine = (x: Product) => quotedLine(x)
    ?? lastPricing.current.get(`${locationId}:${saleTypeCode}:${x.productId}`)
    ?? products.find(product => product.productId === x.productId)?.pricing
    ?? x.pricing;
  const unitPrice = (x: Product) =>
    pricingForLine(x)?.unitPrice ??
    (saleType === "Retail" ? x.retailPrice : x.wholesalePrice);
  const lineGross = (x: CartLine) =>
    retailEditable ? cartLineGross(x.qty, unitPrice(x), pricingForLine(x)) : quotedLine(x)?.grossTotal ?? x.qty * unitPrice(x);
  const lineDiscount = (x: CartLine) => retailEditable && x.retailDiscount
    ? linkedRetailDiscount(lineGross(x), x.retailDiscount).discountRs
    : quotedLine(x)?.discountAmount ?? 0;
  const lineDiscountPct = (x: CartLine) => retailEditable && x.retailDiscount
    ? linkedRetailDiscount(lineGross(x), x.retailDiscount).discountPct
    : quotedLine(x)?.discountPercentage ?? 0;
  const lineNet = (x: CartLine) =>
    retailEditable ? Math.max(0, lineGross(x) - lineDiscount(x)) : quotedLine(x)?.netTotal ?? Math.max(0, lineGross(x) - lineDiscount(x));
  const subtotal = retailEditable ? Math.round(cart.reduce((n, x) => n + lineGross(x), 0) * 100) / 100 : activeQuote?.subtotal ?? cart.reduce((n, x) => n + lineGross(x), 0);
  const discount = Math.round((retailEditable ? cart.reduce((n, x) => n + lineDiscount(x), 0) : activeQuote?.discountTotal ?? cart.reduce((n, x) => n + lineDiscount(x), 0)) * 100) / 100;
  const beforeBillDiscount = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
  const billValue = Number(billDiscount.value || 0);
  const billDiscountError = !Number.isFinite(billValue) || billValue < 0 || !/^\d*(?:\.\d{0,4})?$/.test(billDiscount.value)
    ? 'Enter a valid non-negative discount with at most four decimal places.'
    : billDiscount.type === 'PERCENTAGE' && billValue > 100 ? 'Percentage cannot exceed 100%.'
    : billDiscount.type === 'FIXED' && (!/^\d*(?:\.\d{0,2})?$/.test(billDiscount.value) || billValue > beforeBillDiscount) ? 'Fixed discount must be at most the amount after item discounts, with two decimal places.'
    : '';
  const billDiscountAmount = billDiscountError ? 0 : Math.round((billDiscount.type === 'PERCENTAGE' ? beforeBillDiscount * billValue / 100 : billValue) * 100) / 100;
  const total = Math.max(0, Math.round((beforeBillDiscount - billDiscountAmount) * 100) / 100);
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
    paymentSummary.remaining <= 0 && (total > 0 || cart.length > 0)
      ? "Paid"
      : paymentSummary.applied > 0
        ? "Partially paid"
        : "Unpaid";
  const hasPermission = (code: string) =>
    role?.code === "TENANT_ADMIN" || permissions.includes(code);
  const canAuthorizeCredit = hasPermission("SALES_CREDIT_AUTHORIZE");
  const canApplyBillDiscount = hasPermission('SALES_BILL_DISCOUNT_APPLY') && !sourceQuotationId;
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
            x.productId, x.qty, unitPrice(x), line, sourceQuotationId, retailEditable ? x.retailDiscount : undefined,
          );
        }),
        payments: paymentEntries.map((x) => ({
          paymentMethodId: x.paymentMethodId,
          amount: x.amount,
          paymentChannelId: x.paymentChannelId,
          referenceNumber: x.referenceNumber,
        })),
        sellOnCredit: creditRequired && sellOnCredit,
        billDiscount: billDiscountAmount > 0 ? { type: billDiscount.type, value: billValue } : undefined,
        acceptPriceChanges,
      }),
    onSuccess: (invoice) => {
      if (draftKey) removeBillingDraft(localStorage, draftKey);
      setPrintNotice('');
      setPriceChangeQuote(null);
      setCompletedInvoice(invoice);
      setComplete(true);
      void shortcutsQuery.refetch();
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
    quotePending: quoteQuery.isPending || quoteQuery.isFetching,
    quoteError: quoteQuery.isError,
    hasActiveQuote: Boolean(activeQuote),
    creditReady,
    sessionReady,
    paymentEntryPending: Boolean(editingPaymentId || paid.trim() || paymentSequenceError || billDiscountError || paymentReviewRequired || (billDiscountAmount > 0 && !canApplyBillDiscount)),
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
    if ((!sourceQuotationId && (quoteQuery.isFetching || quoteQuery.isError || !activeQuote)) || submitGuard.current || invoiceMutation.isPending || (sourceQuotationId > 0 && !conversion)) return;
    if (billDiscountError || (billDiscountAmount > 0 && !canApplyBillDiscount)) { setPaymentValidation({ form: billDiscountError || 'Your role cannot apply a bill discount.' }); return; }
    if (paymentReviewRequired) { setPaymentValidation({ form: 'Review the entered payments after changing the bill discount.' }); return; }
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
          retailDiscount: undefined,
          pricing: undefined,
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
          ...(retailEditable && found.retailDiscount ? linkedRetailDiscount(cartLineGross(qty, unitPrice(found), pricingForLine(found)), found.retailDiscount) : {}),
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
            ...(retailEditable && x.retailDiscount ? linkedRetailDiscount(cartLineGross(qty, unitPrice(x), pricingForLine(x)), x.retailDiscount) : {}),
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
    if (sourceQuotationId || (key !== "qty" && !retailEditable)) return;
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
            ...(retailEditable && x.retailDiscount ? linkedRetailDiscount(cartLineGross(qty, unitPrice(x), pricingForLine(x)), x.retailDiscount) : {}),
          };
        }
        if (!retailEditable) return x;
        return { ...x, ...linkedRetailDiscount(lineGross(x), { type: key === "discountPct" ? "PERCENTAGE" : "AMOUNT", value: safe }) };
      }),
    );
  };
  const focusFirst = (section: HTMLDivElement | null) =>
    section?.querySelector<HTMLElement>(section === productSection.current ? 'input[data-flow-order="0"]' : "button,input,select")?.focus();
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
    if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Enter"].includes(event.key)) {
      if (event.key === "Enter" && target instanceof HTMLButtonElement) return;
      const controls = Array.from(cartSection.current?.querySelectorAll<HTMLElement>("[data-cart-cell]:not(:disabled)") ?? []);
      const next = cartFocusTarget(controls.map(control => ({ row: Number(control.dataset.cartRow), column: Number(control.dataset.cartColumn) })), { row, column }, event.key);
      if (next) {
        event.preventDefault();
        const control = controls.find(control => Number(control.dataset.cartRow) === next.row && Number(control.dataset.cartColumn) === next.column);
        control?.focus();
        if (control instanceof HTMLInputElement) control.select();
      }
      return;
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
      const current = key === "discountPct" ? lineDiscountPct(line) : key === "discountRs" ? lineDiscount(line) : line.qty;
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
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || document.querySelector('.modal-bg, dialog[open]')) return;
      if (event.key === 'Delete') {
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && (focused.isContentEditable || focused.closest('input, textarea, select, [contenteditable="true"]'))) return;
        event.preventDefault();
        clearCartButton.current?.click();
      }
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
          ?.querySelector<HTMLElement>("[data-cart-cell]:not(:disabled)")
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
        completeSaleButton.current?.click();
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
    setBillDiscount({ type: 'PERCENTAGE', value: '0' });
    setPaymentReviewRequired(false);
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
    <div className={`pos-page billing-redesign${sourceQuotationId ? ' quotation-conversion' : ''}`}>
      {sourceQuotationId > 0 && <div className="card quotation-conversion-banner"><div><strong>{conversion ? `Converting ${conversion.quotationNumber}` : 'Loading quotation…'}</strong><p>{conversion ? `${conversion.customerNameSnapshot} · ${conversion.locationNameSnapshot}. Quoted items, quantities and prices are locked. Complete payment through this POS checkout.` : conversionQuery.error?.message || 'Preparing accepted quotation.'}</p></div><button className="btn btn-secondary" onClick={() => navigate(conversion ? `/quotations/${conversion.quotationId}` : '/quotations')}>Cancel conversion</button></div>}
      <nav className="billing-breadcrumb" aria-label="Breadcrumb"><span>PROSINCSoftware</span><span aria-hidden="true">›</span><strong>Billing</strong></nav>
      <BillingHeader><div className="page-head billing-header">
        <div className="billing-header-title">
          <span className="billing-header-icon"><BillingIcon name="cart" /></span>
          <div>
          <div className="eyebrow">SALES / POINT OF SALE</div>
          <h1>Sales Point of Sale</h1>
          <p>
            Billing system · {saleType} sale
          </p>
          </div>
        </div>
        <div className="billing-header-context">
          <div><BillingIcon name="location" /><span><strong>{sessionQuery.data?.location.name ?? 'Select location'}</strong><small>Location</small></span></div>
          <div><BillingIcon name="terminal" /><span><strong>{sessionQuery.data?.terminal?.displayName ?? 'Not paired'}</strong><small>Terminal</small></span></div>
          <div><span className={`billing-live-dot${sessionReady ? ' ready' : ''}`} /><span><strong>{sessionQuery.data?.registerSession ? `${sessionQuery.data.registerSession.status} · ${sessionQuery.data.registerSession.businessDate}` : 'Not open'}</strong><small>Register</small></span></div>
          <div><BillingIcon name="session" /><span><strong>{sessionQuery.data?.cashierSession?.status ?? 'Not active'}</strong><small>Cashier session</small></span></div>
          <button type="button" className="btn btn-secondary billing-manage-register" disabled={!locationId}
            onClick={() => navigate(`/pos-register-management?locationId=${locationId}&tab=overview`)}>
            <BillingIcon name="terminal" /> Manage Register
          </button>
        </div>
        <div className="pos-bill-number">
          <small>Current bill</small>
          <strong>{completedInvoice ? saleBillReference(completedInvoice) : "New bill"}</strong>
        </div>
      </div></BillingHeader>
      {locationId > 0 && !sessionReady && (
        <div className="billing-register-warning" role={sessionQuery.isPending ? 'status' : 'alert'}>
          <BillingIcon name="session" />
          <div><strong>{sessionQuery.isPending ? 'Checking register status…' : 'Billing blocked'}</strong>
            <span>{sessionQuery.isPending ? 'Verifying this device and cashier session.' : sessionQuery.data?.blockedReason || sessionQuery.error?.message || 'Open a register and start a cashier session to continue.'}</span>
          </div>
        </div>
      )}
      {printNotice && <div className="success-box" role="status">{printNotice}</div>}
      <div className="pos-layout">
        <section className="pos-workspace">
      <div className="billing-selection-layout">
        <section className="billing-product-area">
          {!sourceQuotationId && <div
            ref={productSection}
            onKeyDown={keepEnterInSection}
            className="card pos-product-picker"
          >
            <div className="sales-card-head">
              <div>
                <h2>
                  <span className="billing-section-icon"><BillingIcon name="barcode" /></span> Add products <kbd className="billing-heading-shortcut">F1</kbd>
                </h2>
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
                  placeholder="Enter item code, barcode or product name..."
                  aria-label="Search billing products"
                />
              </div>
              <select
                data-enter-flow
                data-flow-order="1000"
                className="control"
                aria-label="Filter billing products by category"
                disabled={catalogQuery.isPending || catalogQuery.isError}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="All categories">All categories</option>
                {categoryOptions.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
              <button
                data-enter-flow
                data-flow-order="1001"
                className="btn btn-secondary billing-clear-button"
                onClick={() => {
                  setQuery("");
                  setCategory("All categories");
                }}
              >
                Clear
              </button>
            </div>
            <div className="billing-category-chips" aria-label="Quick categories" onKeyDown={event => { if (event.key === 'Enter') event.stopPropagation(); }}>
              <span>Quick categories:</span>
              <button type="button" className={category === 'All categories' ? 'active' : ''} aria-pressed={category === 'All categories'} onClick={() => setCategory('All categories')}>All categories</button>
              {quickShortcuts.categories.map(name => (
                <button type="button" key={name} className={category === name ? 'active' : ''} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>
              ))}
            </div>
            <div className="billing-quick-items" aria-label="Quick items" onKeyDown={event => { if (event.key === 'Enter') event.stopPropagation(); }}>
              <div className="billing-quick-items-label"><span>Quick items:</span><small>{quickShortcuts.hasHistory ? 'Most used · last 30 days' : 'Available items'}</small></div>
              <div className="billing-quick-items-list">
                {visibleQuickItems.map(item => {
                  const available = Math.max(0, item.stock - (cart.find(line => line.productId === item.productId)?.qty ?? 0));
                  return <button type="button" key={item.productId} disabled={available < 1} onClick={() => add(item)} title={`${item.code} · ${available} available`}>
                    <strong>{item.name}</strong><span>LKR {unitPrice(item).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </button>;
                })}
                {!visibleQuickItems.length && <span className="billing-quick-items-empty">{products.length ? 'No matching quick items.' : 'No items available at this location.'}</span>}
              </div>
            </div>
            {query.trim() || category !== "All categories" ? (
              <div className="pos-product-results">
                {visibleProducts
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
                {!visibleProducts.length && <div className="billing-no-products" role="status"><strong>No matching products</strong><span>Try another category or search, or use Clear to reset the filters.</span></div>}
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
        </section>
        <aside className="billing-context-area">
          <div className="card billing-location-section">
            <span className="billing-section-icon"><BillingIcon name="location" /></span>
            <div>
              <h2>Location</h2>
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
          <div
            ref={saleTypeSection}
            onKeyDown={keepEnterInSection}
            className="card sale-type-section"
          >
            <div className="sale-type-heading">
              <span className="billing-section-icon"><BillingIcon name="tag" /></span>
              <div>
                <h2>Sale Type <kbd className="billing-heading-shortcut">F2</kbd></h2>
              </div>
            </div>
            <div className="sale-type-options">
              <button
                className={saleType === "Retail" ? "active" : ""}
                title="Standard selling price"
                disabled={sourceQuotationId > 0}
                onKeyDown={(event) => selectTypeWithPlus(event, "Retail")}
                onClick={() => changeType("Retail")}
              >
                <span><BillingIcon name="cart" /></span>
                <b>Retail</b>
                <small>Standard selling price</small>
              </button>
              <button
                className={saleType === "Wholesale" ? "active" : ""}
                title="Wholesale price + default discount"
                disabled={sourceQuotationId > 0}
                onKeyDown={(event) => selectTypeWithPlus(event, "Wholesale")}
                onClick={() => changeType("Wholesale")}
              >
                <span><BillingIcon name="terminal" /></span>
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
            ref={customerSection}
            onKeyDown={keepEnterInSection}
            className="card pos-customer"
          >
            <div className="pos-panel-title">
              <h2>
                <span className="billing-section-icon"><BillingIcon name="customer" /></span> Customer <kbd className="billing-heading-shortcut">F4</kbd>
              </h2>
              <div className="customer-actions">
                <button
                  className="btn btn-secondary billing-new-customer"
                  disabled={sourceQuotationId > 0 || !hasPermission('CUSTOMER_CREATE')}
                  onClick={() => {
                    setNewCustomer(true);
                  }}
                >
                  + New
                </button>
                <button
                  className="btn btn-secondary billing-clear-button"
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
                placeholder="Search customer by code, name or phone..."
                aria-label="Search billing customers"
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
          </div>
        </aside>
      </div>
          <div
            ref={cartSection}
            onKeyDown={navigateCart}
            className="card pos-cart"
          >
            <div className="sales-card-head">
              <div>
                <h2>
                  <span className="billing-section-icon"><BillingIcon name="items" /></span> Sale items <kbd className="billing-heading-shortcut">F3</kbd>{" "}
                  <span className="code-chip">{cart.length} items</span>
                </h2>
                <p>
                  Review items, quantities and discounts. Use arrow keys to move between cart fields.{retailEditable ? " Retail discounts: edit % or Rs; the other updates automatically." : ""}
                </p>
              </div>
              <button
                ref={clearCartButton}
                className="btn btn-secondary billing-clear-button"
                disabled={sourceQuotationId > 0}
                onClick={() => {
                  setCart([]);
                  setBillDiscount({ type: 'PERCENTAGE', value: '0' });
                  setPaymentReviewRequired(false);
                  clearPaymentDraft();
                  setPaymentEntries([]);
                  setCheckoutKey(crypto.randomUUID());
                }}
              >
                Clear cart <kbd className="billing-heading-shortcut">Del</kbd>
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
                          value={lineDiscountPct(x) || ""}
                          placeholder="0"
                          disabled={!retailEditable}
                          aria-label={`Discount percentage for ${x.name}`}
                          onFocus={event => event.currentTarget.select()}
                          onChange={event => update(x.code, "discountPct", Number(event.target.value))}
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
                          max={lineGross(x)}
                          disabled={!retailEditable}
                          aria-label={`Discount amount for ${x.name}`}
                          onFocus={event => event.currentTarget.select()}
                          onChange={event => update(x.code, "discountRs", Number(event.target.value))}
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
                            setCart((v) => {
                              const next = v.filter((y) => y.code !== x.code);
                              if (!next.length) { setBillDiscount({ type: 'PERCENTAGE', value: '0' }); setPaymentReviewRequired(false); }
                              return next;
                            });
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
                  <BillingIcon name="box" />
                  <strong>No items in this sale</strong>
                  <span>Search and add products above to get started.</span>
                </div>
              )}
            </div>
          </div>
        </section>
        <aside className="pos-checkout">
            <div className="card billing-cart-summary">
              <div className="pos-panel-title"><h2><span className="billing-section-icon"><BillingIcon name="cart" /></span> Cart summary</h2><span className="billing-item-count">{cart.length} items</span></div>
              <div className="summary-line">
                <span>Items</span>
                <b>{cart.reduce((n, x) => n + x.qty, 0)} units</b>
              </div>
              <div className="summary-line">
                <span>Subtotal</span>
                <b>LKR {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
              </div>
              <div className="summary-line">
                <span>Item discounts</span>
                <b>- LKR {discount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
              </div>
              <div className="summary-line">
                <span>Bill discount{billDiscount.type === 'PERCENTAGE' && billDiscountAmount > 0 ? ` (${billValue}%)` : ''}</span>
                <b>- LKR {billDiscountAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
              </div>
              {canApplyBillDiscount ? <div className="billing-bill-discount">
                <button type="button" className="btn btn-secondary" aria-expanded={billDiscountOpen} onClick={() => setBillDiscountOpen(!billDiscountOpen)}>{billDiscountOpen ? 'Hide bill discount' : 'Edit bill discount'}</button>
                {billDiscountOpen && <div className="billing-bill-discount-fields">
                  <label className="field"><span>Type</span><select className="control" value={billDiscount.type} onChange={(event) => { setBillDiscount({ type: event.target.value as 'PERCENTAGE' | 'FIXED', value: '0' }); setPaymentReviewRequired(paymentEntries.length > 0); }}><option value="PERCENTAGE">Percentage (%)</option><option value="FIXED">Fixed amount (LKR)</option></select></label>
                  <label className="field"><span>{billDiscount.type === 'PERCENTAGE' ? 'Percentage' : 'Amount (LKR)'}</span><input className="control" type="number" min="0" max={billDiscount.type === 'PERCENTAGE' ? 100 : beforeBillDiscount} step={billDiscount.type === 'PERCENTAGE' ? '0.0001' : '0.01'} value={billDiscount.value} onChange={(event) => { setBillDiscount({ ...billDiscount, value: event.target.value }); setPaymentReviewRequired(paymentEntries.length > 0); }} /></label>
                  {billDiscountError && <small className="error-text" role="alert">{billDiscountError}</small>}
                  <button type="button" className="btn btn-secondary" onClick={() => { setBillDiscount({ type: 'PERCENTAGE', value: '0' }); setPaymentReviewRequired(paymentEntries.length > 0); }}>Remove discount</button>
                </div>}
              </div> : <small>Bill discount is read only for this role.{billDiscountAmount > 0 ? ' An authorized cashier must review this draft before checkout.' : ''}</small>}
              {paymentReviewRequired && <div className="error-box" role="status">Bill discount changed. Review payment amounts and methods before checkout.<button type="button" className="btn btn-secondary" disabled={Boolean(paymentSequenceError || billDiscountError)} onClick={() => setPaymentReviewRequired(false)}>I reviewed payments</button></div>}
              <div className="summary-total">
                <span>Invoice total</span>
                <strong>LKR {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
            </div>
          <BillingLoyaltyArea customerId={selectedCustomer?.customerId} />
          <div
            ref={paymentSection}
            onKeyDown={keepEnterInSection}
            className="card pos-payment pos-checkout-card"
          >
            <div className="pos-panel-title">
              <h2><span className="billing-section-icon"><BillingIcon name="payment" /></span> Payment <kbd className="billing-heading-shortcut">F5</kbd></h2>
              <span
                className={`checkout-status ${paymentStatus.toLowerCase().replace(" ", "-")}`}
              >
                {paymentStatus}
              </span>
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
                  Add payment
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
                    <span className="billing-payment-field-label">Card channel</span>
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
                    <span className="billing-payment-field-label">Approval / transaction reference</span>
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
                <b>LKR {paymentSummary.tendered.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
              </div>
              <div>
                <span>Total collected (net)</span>
                <b>LKR {paymentSummary.netReceived.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
              </div>
              <div>
                <span>Applied to invoice</span>
                <b>LKR {paymentSummary.applied.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
              </div>
              <div className="remaining">
                <span>Remaining balance</span>
                <strong>LKR {paymentSummary.remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
              <div>
                <span>Cash change</span>
                <b>LKR {paymentSummary.change.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
              </div>
            </div>
            {creditRequired && (
              <div
                className={`credit-decision ${creditReady ? "ready" : "attention"}`}
              >
                <div>
                  <strong>Customer credit</strong>
                  <span>
                    LKR {paymentSummary.remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} will remain
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
                ref={completeSaleButton}
                disabled={!checkoutReady}
                onClick={() => submitSale()}
              >
                ✓ Complete sale <kbd className="billing-heading-shortcut">F6</kbd>
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
      {newCustomer && <QuickCreateCustomerDialog onClose={() => setNewCustomer(false)} onCreated={customer => {
        setSelectedCustomer({ customerId: Number(customer.customerId), code: customer.customerCode, name: customer.customerName, phone: customer.mobile || customer.phone || '' });
        setCustomerQuery(customer.customerCode);
        setSellOnCredit(false);
        setNewCustomer(false);
      }} />}
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
              · LKR {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
