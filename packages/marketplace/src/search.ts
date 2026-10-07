import type { CatalogPage, ProductCard } from "./catalog";
import { listProducts } from "./catalog";
import type { CatalogQuery } from "./contracts";

export interface ProductSearchProvider {
  search(input: CatalogQuery): Promise<CatalogPage>;
  suggestions(query: string, limit?: number): Promise<ProductCard[]>;
}

export class PostgresProductSearchProvider implements ProductSearchProvider {
  search(input: CatalogQuery): Promise<CatalogPage> {
    return listProducts(input);
  }

  async suggestions(query: string, limit = 6): Promise<ProductCard[]> {
    const result = await listProducts({
      pageSize: Math.min(limit, 12),
      query,
      sort: "recommended",
    });
    return result.items;
  }
}

export const productSearch: ProductSearchProvider =
  new PostgresProductSearchProvider();
