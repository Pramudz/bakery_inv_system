type CatalogItem = { productId: number; name: string; category: string };
type Rankings = { productIds: number[]; categories: string[] };

export function selectBillingShortcuts<T extends CatalogItem>(products: T[], rankings?: Rankings) {
  const available = [...products].sort((a, b) => a.name.localeCompare(b.name) || a.productId - b.productId);
  const byId = new Map(available.map(item => [item.productId, item]));
  const ranked = (rankings?.productIds ?? []).map(id => byId.get(id)).filter((item): item is T => !!item);
  const items = [...new Map([...ranked, ...available].map(item => [item.productId, item])).values()].slice(0, 5);
  const names = new Set(available.map(item => item.category).filter(Boolean));
  const categories = [...new Set([...(rankings?.categories ?? []).filter(name => names.has(name)), ...[...names].sort()])].slice(0, 5);
  return { items, categories, hasHistory: ranked.length > 0 };
}
