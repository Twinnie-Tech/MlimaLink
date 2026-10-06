import type { PrismaService } from '../prisma.service';
import { ReviewsService, summarize } from './reviews.service';

const USER_ID = '66f000000000000000000001';
const PRODUCT_ID = '66f0000000000000000000aa';
const SHOP_ID = '66f0000000000000000000bb';
const at = new Date('2026-10-01T09:00:00Z');

const stored = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  userId: USER_ID,
  rating: 4,
  comment: 'Great fit',
  reviews: 'Friendly shop',
  verified: false,
  createdAt: at,
  updatedAt: at,
  user: { name: 'Amina Wanjiru Kariuki' },
  ...overrides,
});

const delegate = () => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
  upsert: vi.fn(),
  aggregate: vi.fn(),
});

describe('summarize', () => {
  it('averages ratings to one decimal and counts each star', () => {
    expect(
      summarize([
        { rating: 5, _count: { _all: 2 } },
        { rating: 2, _count: { _all: 1 } },
      ]),
    ).toEqual({ average: 4, count: 3, breakdown: [0, 1, 0, 0, 2] });
    expect(summarize([])).toEqual({
      average: 0,
      count: 0,
      breakdown: [0, 0, 0, 0, 0],
    });
  });
});

describe('ReviewsService', () => {
  const product_reviews = delegate();
  const shop_reviews = delegate();
  const products = { findUnique: vi.fn(), update: vi.fn() };
  const shops = { findUnique: vi.fn(), update: vi.fn() };
  const orders = { count: vi.fn() };
  const service = new ReviewsService({
    product_reviews,
    shop_reviews,
    products,
    shops,
    orders,
  } as unknown as PrismaService);

  beforeEach(() => {
    for (const mock of [
      ...Object.values(product_reviews),
      ...Object.values(shop_reviews),
      ...Object.values(products),
      ...Object.values(shops),
      orders.count,
    ]) {
      mock.mockReset();
    }
  });

  it('lists a page of product reviews with totals and the shopper’s own', async () => {
    product_reviews.findMany.mockResolvedValue([stored()]);
    product_reviews.count.mockResolvedValue(6);
    product_reviews.groupBy.mockResolvedValue([
      { rating: 4, _count: { _all: 6 } },
    ]);
    product_reviews.findUnique.mockResolvedValue(stored({ id: 'mine' }));

    const page = await service.listProductReviews(PRODUCT_ID, 2, 5, USER_ID);

    expect(product_reviews.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId: PRODUCT_ID },
        orderBy: { createdAt: 'desc' },
        skip: 5,
        take: 5,
      }),
    );
    expect(page).toMatchObject({
      total: 6,
      page: 2,
      totalPages: 2,
      summary: { average: 4, count: 6 },
      mine: { id: 'mine' },
    });
    expect(page.items[0]).toEqual({
      id: 'r1',
      rating: 4,
      comment: 'Great fit',
      authorName: 'Amina K.',
      verified: false,
      createdAt: at.toISOString(),
      updatedAt: at.toISOString(),
    });
  });

  it('returns no reviews for sample products without asking the database', async () => {
    const page = await service.listProductReviews('7', 1, 5);

    expect(page.items).toEqual([]);
    expect(page.summary.count).toBe(0);
    expect(product_reviews.findMany).not.toHaveBeenCalled();
  });

  it('saves a product review, marks delivered buyers and updates the product rating', async () => {
    products.findUnique.mockResolvedValue({ id: PRODUCT_ID });
    product_reviews.findUnique.mockResolvedValue(null);
    orders.count.mockResolvedValue(1);
    product_reviews.upsert.mockResolvedValue(
      stored({ rating: 5, comment: null, verified: true }),
    );
    product_reviews.aggregate.mockResolvedValue({
      _avg: { rating: 4.333333 },
      _count: { _all: 3 },
    });

    const result = await service.saveProductReview(USER_ID, PRODUCT_ID, {
      rating: 5,
    });

    expect(orders.count).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        status: 'delivered',
        items: { some: { productId: PRODUCT_ID } },
      },
    });
    expect(product_reviews.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_productId: { userId: USER_ID, productId: PRODUCT_ID } },
        create: {
          userId: USER_ID,
          productId: PRODUCT_ID,
          rating: 5,
          comment: null,
          verified: true,
        },
      }),
    );
    expect(products.update).toHaveBeenCalledWith({
      where: { id: PRODUCT_ID },
      data: { ratings: 4.3, reviewCount: 3 },
    });
    expect(result.updated).toBe(false);
    expect(result.review).toMatchObject({ rating: 5, verified: true });
    expect(result.review.comment).toBeUndefined();
  });

  it('says when a review replaced an earlier one', async () => {
    products.findUnique.mockResolvedValue({ id: PRODUCT_ID });
    product_reviews.findUnique.mockResolvedValue({ id: 'r1' });
    orders.count.mockResolvedValue(0);
    product_reviews.upsert.mockResolvedValue(stored());
    product_reviews.aggregate.mockResolvedValue({
      _avg: { rating: 4 },
      _count: { _all: 1 },
    });

    const result = await service.saveProductReview(USER_ID, PRODUCT_ID, {
      rating: 4,
      comment: 'Great fit',
    });

    expect(result.updated).toBe(true);
  });

  it('refuses reviews of products that do not exist', async () => {
    products.findUnique.mockResolvedValue(null);

    await expect(
      service.saveProductReview(USER_ID, PRODUCT_ID, { rating: 3 }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      service.saveProductReview(USER_ID, '7', { rating: 3 }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(product_reviews.upsert).not.toHaveBeenCalled();
  });

  it('saves a shop review and updates the shop rating', async () => {
    shops.findUnique.mockResolvedValue({ id: SHOP_ID });
    shop_reviews.findUnique.mockResolvedValue(null);
    orders.count.mockResolvedValue(2);
    shop_reviews.upsert.mockResolvedValue(stored({ verified: true }));
    shop_reviews.aggregate.mockResolvedValue({ _avg: { rating: 3.75 } });

    const result = await service.saveShopReview(USER_ID, SHOP_ID, {
      rating: 4,
      comment: 'Friendly shop',
    });

    expect(orders.count).toHaveBeenCalledWith({
      where: { userId: USER_ID, shopId: SHOP_ID, status: 'delivered' },
    });
    expect(shop_reviews.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { rating: 4, reviews: 'Friendly shop', verified: true },
      }),
    );
    expect(shops.update).toHaveBeenCalledWith({
      where: { id: SHOP_ID },
      data: { ratings: 3.8 },
    });
    expect(result.review.comment).toBe('Friendly shop');
  });

  it('lists shop reviews and 404s for malformed shop ids', async () => {
    shop_reviews.findMany.mockResolvedValue([stored()]);
    shop_reviews.count.mockResolvedValue(1);
    shop_reviews.groupBy.mockResolvedValue([
      { rating: 4, _count: { _all: 1 } },
    ]);

    const page = await service.listShopReviews(SHOP_ID, 1, 5);

    expect(page.items[0].comment).toBe('Friendly shop');
    expect(page.mine).toBeUndefined();
    expect(shop_reviews.findUnique).not.toHaveBeenCalled();
    await expect(service.listShopReviews('nope', 1, 5)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
