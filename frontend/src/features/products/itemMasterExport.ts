export type ItemMasterExportOptions = {
  scope: 'TENANT' | 'LOCATION';
  priceListId: string;
  locationId?: string;
  search: string;
  status: string;
  categoryId: string;
};

export function itemMasterExportPath(options: ItemMasterExportOptions): string {
  const params = new URLSearchParams({
    scope: options.scope, priceListId: options.priceListId, search: options.search,
    status: options.status, categoryId: options.categoryId,
  });
  if (options.scope === 'LOCATION' && options.locationId) params.set('locationId', options.locationId);
  return `/products/export/item-master?${params}`;
}

export function itemMasterFilename(scope: 'TENANT' | 'LOCATION', businessDate: string, locationCode = '') {
  const code = locationCode.replace(/[^a-zA-Z0-9_-]/g, '_');
  return scope === 'TENANT' ? `item-master-tenant-${businessDate}.csv` : `item-master-location-${code}-${businessDate}.csv`;
}
