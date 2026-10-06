import { apiClient } from "../../../services/apiClient";
import { InvoiceCatalogProduct, InvoiceQuote } from "./invoicesApi";
import { Customer } from "../../customers/api/customersApi";

export type QuotationStatus =
  "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "CONVERTED";
export type QuotationLine = {
  quotationLineId: number;
  productId: number;
  lineNumber: number;
  productCodeSnapshot: string;
  productNameSnapshot: string;
  unitCodeSnapshot: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  discountAmount: string;
  grossTotal: string;
  netTotal: string;
};
export type Quotation = {
  quotationId: number;
  quotationNumber: string;
  quotationDate: string;
  validUntil: string;
  status: QuotationStatus;
  effectiveStatus: string;
  quotationType: "RETAIL" | "WHOLESALE";
  locationId: number;
  customerId: number;
  locationNameSnapshot: string;
  locationCodeSnapshot: string;
  customerNameSnapshot: string;
  customerCodeSnapshot: string;
  customerPhoneSnapshot: string | null;
  customerEmailSnapshot: string | null;
  customerAddressSnapshot: string | null;
  subtotal: string;
  discountTotal: string;
  grandTotal: string;
  notes: string | null;
  termsAndConditions: string | null;
  convertedInvoiceId: number | null;
  createdByUser?: {
    username: string;
    firstName: string | null;
    lastName: string | null;
  };
  lines: QuotationLine[];
};
export type SaveQuotation = {
  locationId: number;
  customerId: number;
  quotationDate: string;
  validUntil: string;
  quotationType: "RETAIL" | "WHOLESALE";
  lines: { productId: number; quantity: number }[];
  notes?: string;
  termsAndConditions?: string;
};
export type QuotationFilters = {
  page: number;
  limit: number;
  dateFrom?: string;
  dateTo?: string;
  quotationNumber?: string;
  customer?: string;
  locationId?: string;
  status?: string;
  quotationType?: string;
};

export const quotationsApi = {
  list: (filters: QuotationFilters) =>
    apiClient.get<{
      items: Quotation[];
      page: number;
      limit: number;
      total: number;
    }>(
      `/quotations?${new URLSearchParams(
        Object.entries(filters)
          .filter(([, value]) => value !== "")
          .map(([key, value]) => [key, String(value)]),
      )}`,
    ),
  locations: () =>
    apiClient.get<{ locationId: number; name: string; code: string }[]>(
      "/quotations/locations",
    ),
  customers: () => apiClient.get<Customer[]>("/quotations/customers"),
  catalog: (locationId: number, saleType: "RETAIL" | "WHOLESALE") =>
    apiClient.get<InvoiceCatalogProduct[]>(
      `/quotations/catalog?locationId=${locationId}&saleType=${saleType}`,
    ),
  price: (data: {
    locationId: number;
    saleType: "RETAIL" | "WHOLESALE";
    details: { productId: number; quantity: number }[];
  }) => apiClient.post<InvoiceQuote>("/quotations/price", data),
  get: (id: number) => apiClient.get<Quotation>(`/quotations/${id}`),
  posPreview: (id: number) =>
    apiClient.get<Quotation>(`/quotations/${id}/pos-preview`),
  create: (data: SaveQuotation) =>
    apiClient.post<Quotation>("/quotations", data),
  update: (id: number, data: SaveQuotation) =>
    apiClient.put<Quotation>(`/quotations/${id}`, data),
  transition: (id: number, action: "send" | "accept" | "reject" | "cancel") =>
    apiClient.patch<Quotation>(`/quotations/${id}/${action}`),
};
