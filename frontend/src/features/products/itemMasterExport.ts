import { reportCsv } from '../../pages/reportExport.ts';
import type { Product } from './api/productsApi';

type Filters = { search: string; status: string; categoryId: string };
type FetchPage = (params: Filters & { page: number; limit: number }) => Promise<{ items: Product[]; totalPages: number }>;

export async function exportItemMasterCsv(fetchPage: FetchPage, filters: Filters): Promise<string> {
  const rows: string[][] = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    const result = await fetchPage({ ...filters, page, limit: 100 });
    totalPages = result.totalPages;
    for (const product of result.items) {
      rows.push([product.sku ?? '', product.productName ?? '', product.category?.categoryName ?? '',
        product.brand?.brandName ?? '', product.baseUnit?.name ?? '', product.isActive ? 'Active' : 'Inactive']);
    }
  }
  return reportCsv(['SKU', 'Item Name', 'Category', 'Brand', 'Base Unit', 'Status'], rows);
}
