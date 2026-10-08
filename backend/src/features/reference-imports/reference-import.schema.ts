export type Master = 'categories' | 'brands' | 'units' | 'suppliers' | 'price-lists' | 'locations';
export type ValueType = 'text' | 'boolean' | 'integer' | 'enum';
export interface ImportColumn {
  header: string; field: string; required?: boolean; max?: number;
  type?: ValueType; values?: string[]; hint: string; sample: string | number | boolean;
}
const col = (header: string, field: string, hint: string, sample: string | number | boolean, extra: Partial<ImportColumn> = {}): ImportColumn =>
  ({ header, field, hint, sample, ...extra });
const yesNo = { type: 'boolean' as const, values: ['TRUE', 'FALSE'] };

export const IMPORT_SPECS: Record<Master, { title: string; filename: string; codeField: string; columns: ImportColumn[] }> = {
  categories: { title: 'Category Master', filename: 'Categories', codeField: 'categoryCode', columns: [
    col('CategoryCode', 'categoryCode', 'Required; unique within your tenant; maximum 50 characters.', 'BAKERY', { required: true, max: 50 }),
    col('CategoryName', 'categoryName', 'Required; unique within your tenant; maximum 150 characters.', 'Bakery', { required: true, max: 150 }),
    col('ParentCategoryCode', 'parentCategoryCode', 'Optional. Existing category code or a category code in this file. Never enter a database ID. Maximum 3 levels.', '', { max: 50 }),
    col('Description', 'description', 'Optional; maximum 255 characters.', 'Fresh baked products', { max: 255 }),
    col('SortOrder', 'sortOrder', 'Optional whole number.', 10, { type: 'integer' }),
  ] },
  brands: { title: 'Brand Master', filename: 'Brands', codeField: 'brandCode', columns: [
    col('BrandCode', 'brandCode', 'Required; unique within your tenant; maximum 50 characters.', 'SUNRISE', { required: true, max: 50 }),
    col('BrandName', 'brandName', 'Required; maximum 150 characters.', 'Sunrise Foods', { required: true, max: 150 }),
    col('Description', 'description', 'Optional; maximum 255 characters.', 'Everyday grocery brand', { max: 255 }),
  ] },
  units: { title: 'Unit Master', filename: 'Units', codeField: 'code', columns: [
    col('Code', 'code', 'Required; unique within your tenant; maximum 30 characters.', 'PCS', { required: true, max: 30 }),
    col('Name', 'name', 'Required; maximum 100 characters.', 'Piece', { required: true, max: 100 }),
    col('Symbol', 'symbol', 'Optional; maximum 20 characters.', 'pc', { max: 20 }),
    col('UnitType', 'unitType', 'Required; maximum 50 characters. Use your normal unit classification.', 'COUNT', { required: true, max: 50 }),
    col('AllowsDecimalQuantity', 'allowsDecimalQuantity', 'Optional TRUE or FALSE; default FALSE.', false, yesNo),
    col('QuantityPrecision', 'quantityPrecision', 'Optional whole number from 0 to 6; default 0.', 0, { type: 'integer' }),
  ] },
  suppliers: { title: 'Supplier Master', filename: 'Suppliers', codeField: 'supplierCode', columns: [
    col('SupplierCode', 'supplierCode', 'Optional manual code, maximum 50 characters. Leave blank for automatic SUP number.', '', { max: 50 }),
    col('SupplierImportRef', 'supplierImportRef', 'Required when SupplierCode is blank. Stable unique reference for safe retries; maximum 100 characters.', 'SUP-REF-001', { max: 100 }),
    col('SupplierName', 'supplierName', 'Required; maximum 200 characters.', 'Island Wholesale Foods', { required: true, max: 200 }),
    col('IsActive', 'isActive', 'Optional TRUE or FALSE; default TRUE.', true, yesNo),
    col('ContactName', 'contactName', 'Optional; maximum 150 characters.', 'Sales Desk', { max: 150 }),
    col('Phone', 'phone', 'Optional; maximum 50 characters. Format as text to preserve leading zeroes.', '0112345678', { max: 50 }),
    col('Mobile', 'mobile', 'Optional; maximum 50 characters. Format as text.', '0771234567', { max: 50 }),
    col('Email', 'email', 'Optional valid email; maximum 150 characters.', 'sales@example.test', { max: 150 }),
    col('AddressLine1', 'addressLine1', 'Optional; maximum 255 characters.', '12 Market Road', { max: 255 }),
    col('AddressLine2', 'addressLine2', 'Optional; maximum 255 characters.', '', { max: 255 }),
    col('City', 'city', 'Optional; maximum 100 characters.', 'Colombo', { max: 100 }),
    col('DistrictOrState', 'districtOrState', 'Optional; maximum 100 characters.', 'Western', { max: 100 }),
    col('PostalCode', 'postalCode', 'Optional; maximum 30 characters. Format as text.', '00100', { max: 30 }),
    col('CountryCode', 'countryCode', 'Optional two-letter country code.', 'LK', { max: 2 }),
  ] },
  'price-lists': { title: 'Price List Master', filename: 'PriceLists', codeField: 'code', columns: [
    col('Code', 'code', 'Required; unique within your tenant; maximum 50 characters.', 'RETAIL-2026', { required: true, max: 50 }),
    col('Name', 'name', 'Required; maximum 150 characters.', 'Retail Prices', { required: true, max: 150 }),
    col('PriceListType', 'priceListType', 'Required; maximum 50 characters. RETAIL and WHOLESALE are used by POS price resolution; other existing classifications are allowed.', 'RETAIL', { required: true, max: 50 }),
    col('CurrencyCode', 'currencyCode', 'Optional three-letter currency code; default LKR.', 'LKR', { max: 3 }),
    col('IsDefault', 'isDefault', 'Optional TRUE or FALSE; default FALSE. At most one active default per sale type.', true, yesNo),
  ] },
  locations: { title: 'Location Master', filename: 'Locations', codeField: 'code', columns: [
    col('Code', 'code', 'Required; normalized to uppercase; unique within your tenant; maximum 50 characters.', 'MAIN-STORE', { required: true, max: 50 }),
    col('Name', 'name', 'Required; maximum 150 characters.', 'Main Store', { required: true, max: 150 }),
    col('LocationType', 'locationType', 'Required supported type.', 'STORE', { required: true, type: 'enum', values: ['HEAD_OFFICE','WAREHOUSE','STORE','DISTRIBUTION_CENTER','OFFICE','OTHER'] }),
    col('IsActive', 'isActive', 'Required TRUE or FALSE.', true, { required: true, ...yesNo }),
    col('ContactPerson', 'contactPerson', 'Optional; maximum 150 characters.', 'Store Manager', { max: 150 }),
    col('Email', 'email', 'Optional valid email; maximum 150 characters.', 'store@example.test', { max: 150 }),
    col('Phone', 'phone', 'Optional; maximum 50 characters. Format as text.', '0112345678', { max: 50 }),
    col('AddressLine1', 'addressLine1', 'Optional; maximum 200 characters.', '45 High Street', { max: 200 }),
    col('AddressLine2', 'addressLine2', 'Optional; maximum 200 characters.', '', { max: 200 }),
    col('City', 'city', 'Optional; maximum 100 characters.', 'Colombo', { max: 100 }),
    col('StateProvince', 'stateProvince', 'Optional; maximum 100 characters.', 'Western', { max: 100 }),
    col('PostalCode', 'postalCode', 'Optional; maximum 30 characters. Format as text.', '00100', { max: 30 }),
    col('CountryCode', 'countryCode', 'Optional two-letter country code.', 'LK', { max: 2 }),
  ] },
};
export const MASTERS = Object.keys(IMPORT_SPECS) as Master[];
export function isMaster(value: string): value is Master { return Object.prototype.hasOwnProperty.call(IMPORT_SPECS, value); }
