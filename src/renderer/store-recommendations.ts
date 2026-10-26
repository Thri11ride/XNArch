import type { CatalogProduct } from '../shared/types';

export type StoreFeedMode = 'recommended' | 'games' | 'gamepass';
export type StoreFeedProduct = CatalogProduct & { isGamePass?: boolean };
export const STORE_FEED_PAGE_SIZE = 21;
export const STORE_BUDGET_UNLIMITED = 500;

export function shouldFillStorePage(visibleCount: number, hasMore: boolean): boolean {
  return visibleCount < STORE_FEED_PAGE_SIZE && hasMore;
}

export function supportedGamePassProducts<T extends { access: string; installability: CatalogProduct['installability'] }>(products: T[]): T[] {
  return products.filter((product) => product.access === 'gamepass' && product.installability === 'supported');
}

function normalizedTitle(title: string): string {
  return title.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function consolidateStoreProducts(products: CatalogProduct[], gamePassProducts: CatalogProduct[]): StoreFeedProduct[] {
  const gamePassOfferIds = new Set(gamePassProducts.map((product) => product.productId.toUpperCase()));
  const licensedIds = new Set(gamePassProducts.flatMap((product) => [product.productId, product.installProductId]
    .filter((id): id is string => Boolean(id)).map((id) => id.toUpperCase())));
  const gamePassTitles = new Set(gamePassProducts.map((product) => normalizedTitle(product.title)));
  const result: StoreFeedProduct[] = [];
  const titleIndexes = new Map<string, number>();
  const idIndexes = new Map<string, number>();

  for (const product of [...products, ...gamePassProducts]) {
    const ids = [product.productId, product.installProductId].filter((id): id is string => Boolean(id)).map((id) => id.toUpperCase());
    const title = normalizedTitle(product.title);
    const index = ids.map((id) => idIndexes.get(id)).find((found) => found !== undefined) ?? titleIndexes.get(title);
    const isGamePass = ('access' in product && product.access === 'gamepass') || ids.some((id) => licensedIds.has(id)) || gamePassTitles.has(title);
    if (index === undefined) {
      const added: StoreFeedProduct = { ...product, isGamePass };
      titleIndexes.set(title, result.length);
      for (const id of ids) idIndexes.set(id, result.length);
      result.push(added);
      continue;
    }

    const current = result[index];
    const currentIsGamePassOffer = gamePassOfferIds.has(current.productId.toUpperCase());
    const productIsGamePassOffer = gamePassOfferIds.has(product.productId.toUpperCase());
    const preferCurrent = currentIsGamePassOffer || !productIsGamePassOffer;
    const preferred = preferCurrent ? current : product;
    const fallback = preferCurrent ? product : current;
    const merged: StoreFeedProduct = {
      ...fallback,
      ...preferred,
      description: preferred.description || fallback.description,
      publisher: preferred.publisher ?? fallback.publisher,
      posterUrl: preferred.posterUrl ?? fallback.posterUrl,
      heroUrl: preferred.heroUrl ?? fallback.heroUrl,
      purchasePrice: preferred.purchasePrice ?? fallback.purchasePrice,
      includedWith: preferred.includedWith ?? fallback.includedWith,
      installProductId: preferred.installProductId ?? fallback.installProductId,
      isGamePass: Boolean(current.isGamePass || isGamePass),
    };
    result[index] = merged;
    titleIndexes.set(title, index);
    for (const id of [...ids, merged.productId, merged.installProductId].filter((value): value is string => Boolean(value)).map((value) => value.toUpperCase())) {
      idIndexes.set(id, index);
    }
  }
  return result;
}

export function storeFeedHasMore(mode: StoreFeedMode, sources: { games: boolean; searches: boolean }): boolean {
  if (mode === 'gamepass') return false;
  if (mode === 'games' || mode === 'recommended') return sources.games || sources.searches;
  return sources.games || sources.searches;
}

export function splitStoreFeedPages<T extends { productId: string }>(products: T[], initialIds: Iterable<string>, laterPageIds: string[][]): T[][] {
  const byId = new Map(products.map((product) => [product.productId.toUpperCase(), product]));
  const shown = new Set<string>();
  const initial = [...initialIds].flatMap((rawId) => {
    const id = rawId.toUpperCase();
    const product = byId.get(id);
    if (!product || shown.has(id)) return [];
    shown.add(id);
    return [product];
  });
  const pages = laterPageIds.map((pageIds) => pageIds.flatMap((rawId) => {
    const id = rawId.toUpperCase();
    const product = byId.get(id);
    if (!product || shown.has(id)) return [];
    shown.add(id);
    return [product];
  })).filter((page) => page.length > 0);
  return [initial, ...pages].filter((page) => page.length > 0);
}

export function matchesBudget(price: number | undefined, maximum: number, isGamePass: boolean): boolean {
  if (isGamePass) return true;
  if (maximum >= STORE_BUDGET_UNLIMITED) return true;
  return price !== undefined && price <= maximum;
}

export function buildInterestQueries(products: CatalogProduct[], limit = 8): string[] {
  const scores = new Map<string, number>();
  for (const product of products) {
    for (const category of product.categories) {
      const query = category.trim();
      if (query.length >= 3 && query.length <= 48) scores.set(query, (scores.get(query) ?? 0) + 3);
    }
    const publisher = product.publisher?.trim();
    if (publisher && publisher.length >= 3 && publisher.length <= 48) scores.set(publisher, (scores.get(publisher) ?? 0) + 1);
  }
  return [...scores]
    .sort(([left, leftScore], [right, rightScore]) => rightScore - leftScore || left.localeCompare(right))
    .slice(0, Math.max(0, limit))
    .map(([query]) => query);
}

export function recommendedProducts(
  candidates: CatalogProduct[],
  licensed: CatalogProduct[],
  installedProductIds: Iterable<string>,
  licensedProductIds: Iterable<string> = [],
): CatalogProduct[] {
  const unavailable = new Set([...installedProductIds, ...licensedProductIds].map((id) => id.toUpperCase()));
  for (const product of licensed) {
    unavailable.add(product.productId.toUpperCase());
    if (product.installProductId) unavailable.add(product.installProductId.toUpperCase());
  }
  const seen = new Set<string>();
  return candidates.filter((product) => {
    const id = product.productId.toUpperCase();
    const installId = product.installProductId?.toUpperCase();
    if (product.installability !== 'supported' || unavailable.has(id) || (installId && unavailable.has(installId)) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}