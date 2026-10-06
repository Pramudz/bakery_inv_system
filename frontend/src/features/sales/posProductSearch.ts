export function filterPosProducts<
  T extends { code: string; name: string; category: string },
>(products: T[], query: string, category: string): T[] {
  const term = query.trim().toLocaleLowerCase();
  return products.filter(
    (product) =>
      (category === "All categories" || product.category === category) &&
      `${product.code} ${product.name}`.toLocaleLowerCase().includes(term),
  );
}
