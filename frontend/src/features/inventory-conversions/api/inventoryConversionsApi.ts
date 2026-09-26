import { apiClient } from "../../../services/apiClient";

export type AllocationMethod =
  | "MANUAL_PERCENT"
  | "BY_EXISTING_WAVG"
  | "BY_WEIGHT";
export type ConversionMovementType = "AVAL" | "AVIN";
export type ConversionStatus = "DRAFT" | "POSTED" | "CANCELLED";

export interface ConversionUnit {
  unitId: number;
  code: string;
  name: string;
  symbol: string | null;
}

export interface ConversionProductUnit {
  productUnitId: number;
  unitId: number;
  conversionFactor: string;
  isBaseUnit: boolean;
  unit: ConversionUnit;
}

export interface ConversionProductContext {
  productId: number;
  sku: string;
  productName: string;
  baseUnit: ConversionUnit;
  productUnits: ConversionProductUnit[];
  quantityOnHand: string;
  averageCost: string | null;
  hasInventoryBalance: boolean;
}

export interface ConversionLocation {
  locationId: number;
  code: string;
  name: string;
  isActive: boolean;
}

export interface ConversionUser {
  userId: number;
  username: string;
  firstName?: string | null;
  lastName?: string | null;
}

export interface InventoryConversionLine {
  inventoryConversionLineId: number;
  movementType: ConversionMovementType;
  productId: number;
  productUnitId: number;
  conversionFactorSnapshot: string;
  quantity: string;
  baseQuantity: string;
  quantityBefore: string | null;
  quantityAfter: string | null;
  wavgBefore: string | null;
  wavgAfter: string | null;
  postedUnitCost: string | null;
  postedValue: string | null;
  allocationPercent: string | null;
  allocationBasisValue: string | null;
  allocationWeight: string | null;
  allocatedValue: string | null;
  remarks: string | null;
  product?: {
    productId: number;
    sku: string;
    productName: string;
    baseUnit?: ConversionUnit;
  };
  productUnit?: ConversionProductUnit;
}

export interface InventoryConversion {
  inventoryConversionId: number;
  conversionNumber: string | null;
  locationId: number;
  conversionDate: string;
  allocationMethod: AllocationMethod;
  remarks: string | null;
  status: ConversionStatus;
  totalInputValue: string | null;
  totalOutputValue: string | null;
  valueVariance: string | null;
  createdByUserId: number;
  postedByUserId: number | null;
  postedAt: string | null;
  cancelledByUserId: number | null;
  cancelledAt: string | null;
  location?: { locationId: number; code: string; name: string };
  createdByUser?: ConversionUser;
  postedByUser?: ConversionUser | null;
  cancelledByUser?: ConversionUser | null;
  lines?: InventoryConversionLine[];
  createdByName?: string | null;
  postedByName?: string | null;
  lineCount?: number;
  avalLineCount?: number;
  avinLineCount?: number;
}

export interface ConversionPage<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ConversionLineInput {
  movementType: ConversionMovementType;
  productId: number;
  productUnitId: number;
  quantity: string;
  allocationPercent?: string;
  allocationWeight?: string;
  remarks?: string;
}

export interface ConversionInput {
  locationId: number;
  allocationMethod: AllocationMethod;
  remarks?: string;
  lines: ConversionLineInput[];
}

export interface PostConversionInput {
  confirmNegativeStock?: boolean;
}

function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  return search.toString();
}

export const inventoryConversionsApi = {
  page: (params: {
    page: number;
    limit: number;
    search: string;
    status: string;
    locationId?: number;
    allocationMethod: string;
    dateFrom?: string;
    dateTo?: string;
  }) =>
    apiClient.get<ConversionPage<InventoryConversion>>(
      `/inventory/value-adjustments?${query(params)}`,
    ),
  get: (id: number) =>
    apiClient.get<InventoryConversion>(`/inventory/value-adjustments/${id}`),
  create: (data: ConversionInput) =>
    apiClient.post<InventoryConversion>("/inventory/value-adjustments", data),
  update: (id: number, data: ConversionInput) =>
    apiClient.put<InventoryConversion>(
      `/inventory/value-adjustments/${id}`,
      data,
    ),
  post: (id: number, data: PostConversionInput = {}) =>
    apiClient.patch<InventoryConversion>(
      `/inventory/value-adjustments/${id}/post`,
      data,
    ),
  cancel: (id: number) =>
    apiClient.patch<InventoryConversion>(
      `/inventory/value-adjustments/${id}/cancel`,
    ),
  productContexts: (params: {
    locationId: number;
    page?: number;
    limit?: number;
    search?: string;
    productId?: number;
  }) =>
    apiClient.get<ConversionPage<ConversionProductContext>>(
      `/inventory/value-adjustments/product-contexts?${query({ page: 1, limit: 20, ...params })}`,
    ),
  locations: () =>
    apiClient.get<ConversionLocation[]>(
      "/inventory/value-adjustments/locations",
    ),
};
