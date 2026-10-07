export type CategoryNode = { categoryId: number | string; parentCategoryId?: number | string | null; categoryName: string; categoryCode?: string };

export function parentCategoryOptions(rows: CategoryNode[], movingId?: number | string) {
  const byId = new Map(rows.map(row => [String(row.categoryId), row]));
  const path = (id: string, visited = new Set<string>()): CategoryNode[] => {
    if (visited.has(id)) return [];
    const row = byId.get(id);
    if (!row) return [];
    const next = new Set(visited).add(id);
    return [...(row.parentCategoryId == null ? [] : path(String(row.parentCategoryId), next)), row];
  };
  const height = (id: string, visited = new Set<string>()): number => {
    if (visited.has(id)) return 4;
    const next = new Set(visited).add(id);
    const children = rows.filter(row => row.parentCategoryId != null && String(row.parentCategoryId) === id);
    return 1 + Math.max(0, ...children.map(child => height(String(child.categoryId), next)));
  };
  const subtreeHeight = movingId == null ? 1 : height(String(movingId));
  return rows.flatMap(row => {
    const chain = path(String(row.categoryId));
    if (!chain.length || chain.some(item => String(item.categoryId) === String(movingId)) || chain.length + subtreeHeight > 3) return [];
    return [{ value: String(row.categoryId), label: chain.map(item => item.categoryName).join(' > '), code: row.categoryCode ?? '' }];
  });
}
