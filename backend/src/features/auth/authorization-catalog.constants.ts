export const AUTHORIZATION_MODULES = [
  ['MASTER_DATA', 'Master Data'], ['PRODUCT', 'Products'], ['SUPPLIER', 'Suppliers'],
  ['LOCATION', 'Locations'], ['PRICING', 'Pricing'], ['USER_MANAGEMENT', 'User Management'],
  ['PURCHASING', 'Purchasing'], ['INVENTORY', 'Inventory'], ['CUSTOMER', 'Customer'],
  ['SALES', 'Sales'],
] as const;

// Purchasing remains controlled by the platform administrator. All other catalog modules
// are enabled for a new tenant, matching the policy used when cataloging existing tenants.
export const DEFAULT_TENANT_MODULE_CODES: readonly string[] = AUTHORIZATION_MODULES
  .filter(([code]) => code !== 'PURCHASING')
  .map(([code]) => code);
