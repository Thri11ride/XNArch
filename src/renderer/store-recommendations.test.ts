import { expect, it } from 'vitest';
import type { CatalogProduct } from '../shared/types';
import { buildInterestQueries, consolidateStoreProducts, matchesBudget, recommendedProducts, shouldFillStorePage, splitStoreFeedPages, storeFeedHasMore, supportedGamePassProducts, STORE_BUDGET_UNLIMITED, STORE_FEED_PAGE_SIZE } from './store-recommendations';

function product(productId: string, options: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    productId, title: productId, description: '', categories: [], installability: 'supported', supportNote: '',
    ...options,
  };
}

it('prioritizes recurring licensed-game categories for recommendation searches', () => {
  const queries = buildInterestQueries([
    product('OWNED0000001', { categories: ['Role playing', 'Action'], publisher: 'Studio A' }),
    product('OWNED0000002', { categories: ['Role playing'], publisher: 'Studio A' }),
    product('OWNED0000003', { categories: ['Action'] }),
    product('OWNED0000004', { categories: ['Role playing'] }),
  ], 3);
  expect(queries[0]).toBe('Role playing');
  expect(queries).toContain('Action');
  expect(queries).toContain('Studio A');
});

it('excludes licensed, installed, unsupported, and duplicate products', () => {
  const candidates = [
    product('OWNED0000001'),
    product('INSTALLED001'),
    product('BUNDLE000001', { installProductId: 'OWNED0000001' }),
    product('OLDOWNED00001'),
    product('UNSUPPORTED1', { installability: 'unsupported' }),
    product('UNKNOWN00001', { installability: 'unknown' }),
    product('NEWGAME00001'),
    product('NEWGAME00001', { title: 'duplicate' }),
  ];
  expect(recommendedProducts(candidates, [product('OWNED0000001')], ['INSTALLED001'], ['OLDOWNED00001']).map(({ productId }) => productId))
    .toEqual(['NEWGAME00001']);
});

it('applies one maximum-price ceiling and keeps Game Pass games regardless of price', () => {
  expect(matchesBudget(4.99, 5, false)).toBe(true);
  expect(matchesBudget(5, 5, false)).toBe(true);
  expect(matchesBudget(5.01, 5, false)).toBe(false);
  expect(matchesBudget(35, 20, false)).toBe(false);
  expect(matchesBudget(125, 200, false)).toBe(true);
  expect(matchesBudget(750, STORE_BUDGET_UNLIMITED, false)).toBe(true);
  expect(matchesBudget(undefined, STORE_BUDGET_UNLIMITED, false)).toBe(true);
  expect(matchesBudget(35, 20, true)).toBe(true);
  expect(matchesBudget(undefined, 20, true)).toBe(true);
  expect(matchesBudget(undefined, 20, false)).toBe(false);
});

it('shows Load More only when the selected feed has an available source cursor', () => {
  const sources = { games: false, searches: false };
  expect(storeFeedHasMore('recommended', sources)).toBe(false);
  expect(storeFeedHasMore('games', { ...sources, searches: true })).toBe(true);
  expect(storeFeedHasMore('games', { ...sources, games: true })).toBe(true);
  expect(storeFeedHasMore('games', { ...sources, searches: true })).toBe(true);
  expect(storeFeedHasMore('gamepass', { games: true, searches: true })).toBe(false);
});

it('fills visible Store pages to 21 entries only while source pages remain', () => {
  expect(STORE_FEED_PAGE_SIZE).toBe(21);
  expect(shouldFillStorePage(20, true)).toBe(true);
  expect(shouldFillStorePage(21, true)).toBe(false);
  expect(shouldFillStorePage(4, false)).toBe(false);
});

it('Game Pass feed includes only positively supported Game Pass library entries', () => {
  const products = [
    { ...product('GP-SUPPORTED'), access: 'gamepass', installability: 'supported' as const },
    { ...product('GP-UNSUPPORTED'), access: 'gamepass', installability: 'unsupported' as const },
    { ...product('OWNED-SUPPORTED'), access: 'owned', installability: 'supported' as const },
  ];
  expect(supportedGamePassProducts(products).map(({ productId }) => productId)).toEqual(['GP-SUPPORTED']);
});

it('keeps newly loaded Store results in separate appended page groups', () => {
  const products = [product('FIRST0000001'), product('SECOND00001'), product('THIRD000001')];
  expect(splitStoreFeedPages(products, ['FIRST0000001'], [['SECOND00001'], ['THIRD000001']]).map(page => page.map(item => item.productId)))
    .toEqual([['FIRST0000001'], ['SECOND00001'], ['THIRD000001']]);
});

it('consolidates duplicate Game Pass listings and retains price and availability', () => {
  const feed = product('BASEPRODUCT001', { title: 'Example Game', purchasePrice: '$19.99', posterUrl: 'cover' });
  const gamePass = { ...product('GAMEPASSPROD1', { title: 'Example Game', installProductId: 'BASEPRODUCT001' }), access: 'gamepass' as const };
  const consolidated = consolidateStoreProducts([feed, { ...feed }], [gamePass]);
  expect(consolidated).toHaveLength(1);
  expect(consolidated[0]).toMatchObject({
    productId: 'GAMEPASSPROD1',
    installProductId: 'BASEPRODUCT001',
    purchasePrice: '$19.99',
    posterUrl: 'cover',
    isGamePass: true,
  });
});

it('does not merge distinct edition titles when they share a display name prefix', () => {
  const editions = consolidateStoreProducts([
    product('STANDARD00001', { title: 'Example Game Standard Edition' }),
    product('DELUXE000001', { title: 'Example Game Deluxe Edition' }),
  ], []);
  expect(editions).toHaveLength(2);
});