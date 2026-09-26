import { apiClient } from "../../../services/apiClient";

export type AdjustmentMovementType = "ADJI" | "ADJO";
export type AdjustmentStatus = "DRAFT" | "POSTED" | "CANCELLED";
export type AdjustmentDirection = "IN" | "OUT" | "BOTH";
export type AdjustmentCostingPolicy = "CURRENT_WAVG" | "MANUAL_REQUIRED";

export interface AdjustmentReason {
  inventoryAdjustmentReasonId: number;
  code: string;
  name: string;
  allowedDirection: AdjustmentDirection;
  reasonCategory: string | null;
  costingPolicy: AdjustmentCostingPolicy;
  requiresRemarks: boolean;
  requiresApproval: boolean;
  isSystemReason: boolean;
  isActive: boolean;
}

export interface AdjustmentUnit {
  unitId: number;
  code: string;
  name: string;
  symbol: string | null;
}

export interface AdjustmentProductUnit {
  productUnitId: number;
  unitId: number;
  conversionFactor: string;
  isBaseUnit: boolean;
  unit: AdjustmentUnit;
}

export interface AdjustmentProductContext {
  productId: number;
  sku: string;
  productName: string;
  baseUnit: AdjustmentUnit;
  productUnits: AdjustmentProductUnit[];
  quantityOnHand: string;
  averageCost: string | null;
  hasInventoryBalance: boolean;
}

export interface AdjustmentLocation {
  locationId: number;
  code: string;
  name: string;
  isActive: boolean;
}

export interface AdjustmentLine {
  inventoryAdjustmentLineId: number;
  productId: number;
  productUnitId: number;
  conversionFactorSnapshot: string;
  quantity: string;
  baseQuantity: string;
  unitCost: string | null;
  inventoryValue: string | null;
  quantityBefore: string | null;
  quantityAfter: string | null;
  remarks: string | null;
  product?: {
    productId: number;
    sku: string;
    productName: string;
    baseUnit?: AdjustmentUnit;
  };
  productUnit?: AdjustmentProductUnit;
}

export interface AdjustmentUser {
  userId: number;
  username: string;
  firstName?: string | null;
  lastName?: string | null;
}

export interface InventoryAdjustment {
  inventoryAdjustmentId: number;
  adjustmentNumber: string | null;
  adjustmentDate: string;
  locationId: number;
  movementType: AdjustmentMovementType;
  reasonId: number;
  referenceNumber: string | null;
  remarks: string | null;
  status: AdjustmentStatus;
  createdByUserId: number;
  postedByUserId: number | null;
  postedAt: string | null;
  cancelledByUserId: number | null;
  cancelledAt: string | null;
  reason?: AdjustmentReason;
  location?: { locationId: number; code: string; name: string };
  createdByUser?: AdjustmentUser;
  postedByUser?: AdjustmentUser | null;
  cancelledByUser?: AdjustmentUser | null;
  lines?: AdjustmentLine[];
  createdByName?: string | null;
  postedByName?: string | null;
  lineCount?: number;
  valueImpact?: string | null;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdjustmentLineInput {
  productId: number;
  productUnitId: number;
  quantity: string;
  unitCost?: string;
  remarks?: string;
}

export interface AdjustmentInput {
  locationId: number;
  movementType: AdjustmentMovementType;
  reasonId: number;
  referenceNumber?: string;
  remarks?: string;
  lines: AdjustmentLineInput[];
}

export interface AdjustmentReasonInput {
  code: string;
  name: string;
  allowedDirection: AdjustmentDirection;
  reasonCategory?: string;
  costingPolicy: AdjustmentCostingPolicy;
  requiresRemarks?: boolean;
  requiresApproval?: boolean;
}

function query(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  return search.toString();
}

export const inventoryAdjustmentsApi = {
  page: (params: {
    page: number;
    limit: number;
    search: string;
    status: string;
    movementType: string;
    reasonId?: number;
    locationId?: number;
    dateFrom?: string;
    dateTo?: string;
  }) =>
    apiClient.get<PageResult<InventoryAdjustment>>(
      `/inventory/adjustments?${query(params)}`,
    ),
  get: (id: number) =>
    apiClient.get<InventoryAdjustment>(`/inventory/adjustments/${id}`),
  create: (data: AdjustmentInput) =>
    apiClient.post<InventoryAdjustment>("/inventory/adjustments", data),
  update: (id: number, data: AdjustmentInput) =>
    apiClient.put<InventoryAdjustment>(`/inventory/adjustments/${id}`, data),
  post: (id: number, confirmNegativeStock = false) =>
    apiClient.patch<InventoryAdjustment>(`/inventory/adjustments/${id}/post`, {
      confirmNegativeStock,
    }),
  cancel: (id: number) =>
    apiClient.patch<InventoryAdjustment>(`/inventory/adjustments/${id}/cancel`),
  productContexts: (params: {
    locationId: number;
    page?: number;
    limit?: number;
    search?: string;
    productId?: number;
  }) =>
    apiClient.get<PageResult<AdjustmentProductContext>>(
      `/inventory/adjustments/product-contexts?${query({ page: 1, limit: 20, ...params })}`,
    ),
  locations: () =>
    apiClient.get<AdjustmentLocation[]>("/inventory/adjustments/locations"),
  reasons: (params: { direction?: string; active?: boolean } = {}) =>
    apiClient.get<AdjustmentReason[]>(
      `/inventory/adjustment-reasons?${query(params)}`,
    ),
  reasonPage: (params: {
    page: number;
    limit: number;
    search: string;
    direction: string;
    active: string;
    system: string;
  }) =>
    apiClient.get<PageResult<AdjustmentReason>>(
      `/inventory/adjustment-reasons?${query(params)}`,
    ),
  createReason: (data: AdjustmentReasonInput) =>
    apiClient.post<AdjustmentReason>("/inventory/adjustment-reasons", data),
  updateReason: (id: number, data: Partial<AdjustmentReasonInput>) =>
    apiClient.put<AdjustmentReason>(
      `/inventory/adjustment-reasons/${id}`,
      data,
    ),
  setReasonActive: (id: number, isActive: boolean) =>
    apiClient.patch<AdjustmentReason>(
      `/inventory/adjustment-reasons/${id}/active`,
      { isActive },
    ),
};
