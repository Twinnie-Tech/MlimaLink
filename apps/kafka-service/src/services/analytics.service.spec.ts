import { prisma } from '../prisma';
import {
  USER_ACTIONS_KEPT,
  updateProductAnalytics,
  updateShopAnalytics,
  updateUserAnalytics,
} from './analytics.service';

vi.mock('../prisma', () => ({
  prisma: {
    user_analytics: { findUnique: vi.fn(), upsert: vi.fn() },
    shop_analytics: { upsert: vi.fn() },
    product_analytics: { upsert: vi.fn(), updateMany: vi.fn() },
  },
}));

const db = vi.mocked(prisma, { deep: true });

const userId = 'a'.repeat(24);
const shopId = 'b'.repeat(24);
const productId = 'c'.repeat(24);
const timestamp = '2026-10-05T16:00:00.000Z';
const at = new Date(timestamp);

describe('updateUserAnalytics', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('starts a shopper’s analytics with their first add', async () => {
    db.user_analytics.findUnique.mockResolvedValue(null);

    await updateUserAnalytics({
      userId,
      action: 'add_to_wishlist',
      productId,
      shopId,
      timestamp,
    });

    expect(db.user_analytics.upsert).toHaveBeenCalledWith({
      where: { userId },
      create: {
        userId,
        actions: [{ action: 'add_to_wishlist', productId, shopId, at }],
        wishlistAdds: 1,
        cartAdds: 0,
        lastActiveAt: at,
      },
      update: {
        actions: {
          set: [{ action: 'add_to_wishlist', productId, shopId, at }],
        },
        wishlistAdds: { increment: 1 },
        cartAdds: { increment: 0 },
        lastActiveAt: at,
      },
    });
  });

  it('records where the shopper was, keeping what the event doesn’t say', async () => {
    db.user_analytics.findUnique.mockResolvedValue(null);

    await updateUserAnalytics({
      userId,
      action: 'product_view',
      productId,
      device: 'mobile',
      country: 'KE',
      timestamp,
    });

    const { create, update } = db.user_analytics.upsert.mock.calls[0][0];
    expect(create).toMatchObject({ device: 'mobile', country: 'KE' });
    expect(update).toMatchObject({ device: 'mobile', country: 'KE' });
    expect(update).not.toHaveProperty('city');
  });

  it('keeps only the latest actions', async () => {
    const old = Array.from({ length: USER_ACTIONS_KEPT }, (_, index) => ({
      action: 'add_to_cart',
      productId: String(index).padStart(24, '0'),
      shopId: null,
      at: new Date('2026-10-01T00:00:00Z'),
    }));
    db.user_analytics.findUnique.mockResolvedValue({ actions: old } as never);

    await updateUserAnalytics({
      userId,
      action: 'add_to_cart',
      productId,
      timestamp,
    });

    const { update } = db.user_analytics.upsert.mock.calls[0][0];
    const actions = (update.actions as { set: unknown[] }).set;
    expect(actions).toHaveLength(USER_ACTIONS_KEPT);
    expect(actions[0]).toBe(old[1]);
    expect(actions.at(-1)).toEqual({
      action: 'add_to_cart',
      productId,
      shopId: null,
      at,
    });
    expect(update.cartAdds).toEqual({ increment: 1 });
  });

  it('records product views for recommendations', async () => {
    db.user_analytics.findUnique.mockResolvedValue(null);

    await updateUserAnalytics({
      userId,
      action: 'product_view',
      productId,
      shopId,
      timestamp,
    });

    const { create } = db.user_analytics.upsert.mock.calls[0][0];
    expect(create).toMatchObject({
      actions: [{ action: 'product_view', productId, shopId, at }],
      wishlistAdds: 0,
      cartAdds: 0,
    });
  });

  it.each([
    ['remove_from_wishlist', 'add_to_wishlist'],
    ['remove_from_cart', 'add_to_cart'],
  ] as const)('%s deletes the product’s %s', async (remove, add) => {
    const otherProduct = 'd'.repeat(24);
    const entry = (action: string, id = productId) => ({
      action,
      productId: id,
      shopId,
      at: new Date('2026-10-01T00:00:00Z'),
    });
    const kept = [
      entry('product_view'),
      entry(add, otherProduct),
      entry(remove === 'remove_from_cart' ? 'add_to_wishlist' : 'add_to_cart'),
    ];
    db.user_analytics.findUnique.mockResolvedValue({
      actions: [kept[0], entry(add), kept[1], kept[2], entry(add)],
    } as never);

    await updateUserAnalytics({
      userId,
      action: remove,
      productId,
      shopId,
      timestamp,
    });

    const { update } = db.user_analytics.upsert.mock.calls[0][0];
    expect(update.actions).toEqual({ set: kept });
    expect(update.wishlistAdds).toEqual({ increment: 0 });
    expect(update.cartAdds).toEqual({ increment: 0 });
  });

  it('ignores events without a product', async () => {
    await updateUserAnalytics({ userId, action: 'add_to_cart', timestamp });

    expect(db.user_analytics.upsert).not.toHaveBeenCalled();
  });
});

describe('updateProductAnalytics', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    ['product_view', 'views'],
    ['add_to_cart', 'cartAdds'],
    ['add_to_wishlist', 'wishlistAdds'],
    ['purchase', 'purchases'],
  ] as const)('%s adds one to %s', async (action, counter) => {
    await updateProductAnalytics({
      userId,
      action,
      productId,
      shopId,
      timestamp,
    });

    expect(db.product_analytics.upsert).toHaveBeenCalledWith({
      where: { productId },
      create: { productId, shopId, [counter]: 1 },
      update: { shopId, [counter]: { increment: 1 } },
    });
  });

  it.each([
    ['remove_from_cart', 'cartAdds'],
    ['remove_from_wishlist', 'wishlistAdds'],
  ] as const)(
    '%s takes one off %s, never below zero',
    async (action, counter) => {
      await updateProductAnalytics({
        userId,
        action,
        productId,
        shopId,
        timestamp,
      });

      expect(db.product_analytics.updateMany).toHaveBeenCalledWith({
        where: { productId, [counter]: { gt: 0 } },
        data: { [counter]: { decrement: 1 } },
      });
      expect(db.product_analytics.upsert).not.toHaveBeenCalled();
    },
  );

  it('ignores shop visits', async () => {
    await updateProductAnalytics({
      userId,
      action: 'shop_visit',
      shopId,
      timestamp,
    });

    expect(db.product_analytics.upsert).not.toHaveBeenCalled();
    expect(db.product_analytics.updateMany).not.toHaveBeenCalled();
  });
});

describe('updateShopAnalytics', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('counts a visit', async () => {
    await updateShopAnalytics({
      userId,
      action: 'shop_visit',
      shopId,
      timestamp,
    });

    expect(db.shop_analytics.upsert).toHaveBeenCalledWith({
      where: { shopId },
      create: { shopId, totalVisits: 1, lastVisitedAt: at },
      update: { totalVisits: { increment: 1 }, lastVisitedAt: at },
    });
  });
});
