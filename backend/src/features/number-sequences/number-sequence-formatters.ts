export const formatSku = (nextNumber: number) =>
  `SKU-${String(nextNumber).padStart(6, '0')}`;

export const formatPurchaseOrderNumber = (
  tenantId: number,
  year: string,
  nextNumber: number,
) => `PO-${tenantId}-${year}-${String(nextNumber).padStart(6, '0')}`;

export const formatGoodsReceiptNumber = (
  tenantId: number,
  year: string,
  nextNumber: number,
) => `GRN-${tenantId}-${year}-${String(nextNumber).padStart(6, '0')}`;

export const formatSupplierCode = (nextNumber: number) =>
  `SUP-${String(nextNumber).padStart(6, '0')}`;

export const formatCustomerCode = (nextNumber: number) =>
  `CUS-${String(nextNumber).padStart(6, '0')}`;
