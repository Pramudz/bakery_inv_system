export const PRODUCT_IMPORT_TYPES = [
  'onboarding', 'products', 'product-units', 'identifiers', 'selling-prices',
  'selling-discounts', 'product-suppliers', 'supplier-units', 'supplier-prices',
  'product-locations', 'product-attributes',
] as const;
export type ProductImportType = typeof PRODUCT_IMPORT_TYPES[number];
export type ProductImportSheet = Exclude<ProductImportType, 'onboarding'>;
export const PRODUCT_SHEETS: ProductImportSheet[] = PRODUCT_IMPORT_TYPES.slice(1) as ProductImportSheet[];
export const isProductImportType = (value: string): value is ProductImportType =>
  (PRODUCT_IMPORT_TYPES as readonly string[]).includes(value);

export interface ImportColumn { header: string; required?: boolean; hint: string }
export interface SheetSpec { name: string; columns: ImportColumn[]; sample: Record<string, string | number | boolean>[] }
const c = (header: string, hint: string, required = false): ImportColumn => ({ header, hint, required });
const product = c('ProductImportKey', 'Onboarding: stable reference within a Dataset ID; maintenance: use SKU.');
const sku = c('SKU', 'Existing ERP SKU; required for individual maintenance.');
const op = c('Operation', 'CREATE, UPDATE, REVISE, END or SKIP as supported by this sheet.');

export const PRODUCT_IMPORT_SPECS: Record<ProductImportSheet, SheetSpec> = {
  products: { name: '01 Products', columns: [product, sku, op,
    c('ProductName', 'Required on CREATE; descriptive name.', true), c('Description', 'Optional description; blank never clears.'),
    c('ProductType', 'Wizard classification, normally STOCK or SERVICE.'),
    c('CategoryCode', 'Existing active tenant category code.', true), c('BrandCode', 'Existing active tenant brand code; optional.'),
    c('BaseUnitCode', 'Existing active tenant unit code.', true),
    c('IsActive', 'TRUE or FALSE; defaults TRUE.'), c('IsSellable', 'TRUE or FALSE; defaults TRUE.'),
    c('IsPurchasable', 'TRUE or FALSE; defaults TRUE.'), c('IsStockItem', 'TRUE or FALSE; defaults TRUE.'),
    c('TrackBatch', 'TRUE or FALSE.'), c('TrackExpiry', 'TRUE or FALSE.'), c('TrackSerial', 'TRUE or FALSE.'),
  ], sample: [{ ProductImportKey: 'P001', Operation: 'CREATE', ProductName: 'Cocoa Biscuit 100g', CategoryCode: 'BISCUITS', BrandCode: 'SAMPLE', BaseUnitCode: 'PCS', ProductType: 'STOCK', IsSellable: true, IsPurchasable: true, IsStockItem: true }] },
  'product-units': { name: '02 Product Units', columns: [product, sku, op, c('UnitCode', 'Existing tenant unit code.', true),
    c('ConversionFactor', 'Base-unit quantity represented by one unit; base must equal 1.', true),
    c('IsBaseUnit', 'TRUE only for the base unit.'), c('IsPurchaseUnit', 'TRUE if purchasable.'),
    c('IsSalesUnit', 'POS supports only the base sales unit.'), c('IsActive', 'TRUE or FALSE.')],
    sample: [{ ProductImportKey: 'P001', Operation: 'CREATE', UnitCode: 'PCS', ConversionFactor: 1, IsBaseUnit: true, IsPurchaseUnit: true, IsSalesUnit: true, IsActive: true }] },
  identifiers: { name: '03 Identifiers', columns: [product, sku, op, c('IdentifierTypeCode', 'Existing active identifier type code.', true),
    c('IdentifierValue', 'Tenant-wide unique value; normalised by the Product Wizard.', true),
    c('UnitCode', 'Optional product unit code.'), c('IsPrimary', 'TRUE or FALSE.'), c('IsActive', 'TRUE or FALSE.')],
    sample: [{ ProductImportKey: 'P001', Operation: 'CREATE', IdentifierTypeCode: 'BARCODE', IdentifierValue: '8901234567001', UnitCode: 'PCS', IsPrimary: true }] },
  'selling-prices': { name: '04 Selling Prices', columns: [product, sku, op, c('PriceListCode', 'Existing active tenant Price List code.', true),
    c('UnitCode', 'Existing base sales Product Unit code.', true), c('SellingPrice', 'Positive decimal; required for CREATE/REVISE.'),
    c('CurrencyCode', 'Three-letter currency; defaults to Price List currency.'), c('MinimumQuantity', 'Quantity tier; defaults 1.'),
    c('EffectiveFrom', 'Onboarding YYYY-MM-DD; maintenance tenant date or ISO timestamp with offset; REVISE must be future.'), c('EffectiveTo', 'Onboarding date-only or maintenance END boundary.'),
    c('IsActive', 'Onboarding TRUE/FALSE; maintenance CREATE is active and END closes a version.')],
    sample: [{ ProductImportKey: 'P001', Operation: 'CREATE', PriceListCode: 'RETAIL-2026', UnitCode: 'PCS', SellingPrice: 250, CurrencyCode: 'LKR', MinimumQuantity: 1, EffectiveFrom: '2026-01-01' }] },
  'selling-discounts': { name: '05 Selling Discounts', columns: [product, sku, op, c('PriceListCode', 'Existing tenant Price List code.', true),
    c('UnitCode', 'Base sales Product Unit code.', true), c('CurrencyCode', 'Price currency; default LKR.'),
    c('MinimumQuantity', 'Quantity tier; default 1.'), c('PriceEffectiveFrom', 'Price-version start to disambiguate versions.'),
    c('DiscountType', 'PERCENTAGE or FIXED_AMOUNT.'), c('DiscountValue', 'Positive value, maximum 100 for PERCENTAGE.'),
    c('EffectiveFrom', 'Onboarding YYYY-MM-DD; maintenance tenant date or ISO timestamp within price validity.'), c('EffectiveTo', 'Tenant date or ISO timestamp; required for END.')],
    sample: [{ ProductImportKey: 'P001', Operation: 'CREATE', PriceListCode: 'RETAIL-2026', UnitCode: 'PCS', CurrencyCode: 'LKR', MinimumQuantity: 1, DiscountType: 'PERCENTAGE', DiscountValue: 5, EffectiveFrom: '2026-01-01' }] },
  'product-suppliers': { name: '06 Product Suppliers', columns: [product, sku, op,
    c('SupplierCode', 'Existing active tenant supplier code.', true), c('IsPrimarySupplier', 'TRUE for at most one active primary supplier.'),
    c('BaselineLeadTimeDays', 'Optional nonnegative whole days.'), c('IsActive', 'TRUE or FALSE.')],
    sample: [{ ProductImportKey: 'P001', Operation: 'CREATE', SupplierCode: 'SUP-001', IsPrimarySupplier: true, IsActive: true }] },
  'supplier-units': { name: '07 Supplier Purchase Units', columns: [product, sku, op, c('SupplierCode', 'Existing tenant supplier code.', true),
    c('UnitCode', 'Existing purchase Product Unit code.', true), c('SupplierProductCode', 'Optional supplier item code.'),
    c('MinimumOrderQty', 'Optional positive decimal.'), c('LeadTimeDays', 'Optional nonnegative whole days.'),
    c('IsDefaultPurchaseUnit', 'TRUE for supplier default.'), c('IsActive', 'TRUE or FALSE.')],
    sample: [{ ProductImportKey: 'P001', Operation: 'CREATE', SupplierCode: 'SUP-001', UnitCode: 'PCS', MinimumOrderQty: 1, IsDefaultPurchaseUnit: true, IsActive: true }] },
  'supplier-prices': { name: '08 Supplier Purchase Prices', columns: [product, sku, op,
    c('SupplierCode', 'Existing tenant supplier code.', true), c('UnitCode', 'Supplier purchase Product Unit code.', true),
    c('PurchasePrice', 'Positive decimal; required for CREATE/REVISE.'), c('CurrencyCode', 'Three-letter currency; defaults LKR.'),
    c('MinimumQuantity', 'Quantity tier; defaults 1.'), c('EffectiveFrom', 'Onboarding YYYY-MM-DD; maintenance tenant date or whole-second ISO timestamp.'),
    c('EffectiveTo', 'Onboarding YYYY-MM-DD or maintenance END boundary; stored to whole seconds.'), c('IsActive', 'Onboarding TRUE/FALSE; maintenance CREATE is active and END closes a version.')],
    sample: [{ ProductImportKey: 'P001', Operation: 'CREATE', SupplierCode: 'SUP-001', UnitCode: 'PCS', PurchasePrice: 180, CurrencyCode: 'LKR', MinimumQuantity: 1, EffectiveFrom: '2026-01-01' }] },
  'product-locations': { name: '09 Product Locations', columns: [product, sku, op, c('LocationCode', 'Existing active tenant location code.', true),
    c('IsActive', 'TRUE or FALSE.'), c('IsSellable', 'TRUE or FALSE.'), c('IsPurchasable', 'TRUE or FALSE.')],
    sample: [{ ProductImportKey: 'P001', Operation: 'CREATE', LocationCode: 'MAIN-STORE', IsActive: true, IsSellable: true, IsPurchasable: true }] },
  'product-attributes': { name: '10 Product Attributes', columns: [product, sku, op, c('AttributeCode', 'Existing active tenant attribute code.', true),
    c('Value', 'Attribute value, maximum 500 characters.', true)],
    sample: [{ ProductImportKey: 'P001', Operation: 'CREATE', AttributeCode: 'FLAVOUR', Value: 'Cocoa' }] },
};

export const productImportColumns = (sheet: ProductImportSheet, type: ProductImportType): ImportColumn[] => {
  const columns = PRODUCT_IMPORT_SPECS[sheet].columns;
  if (sheet !== 'identifiers' || type !== 'identifiers') return columns;
  const index = columns.findIndex((column) => column.header === 'IdentifierValue') + 1;
  return [...columns.slice(0, index), c('ExistingIdentifierValue', 'For UPDATE, the current barcode/value that identifies the existing Product Identifier. Leave blank when IdentifierValue is unchanged.'), ...columns.slice(index)];
};
