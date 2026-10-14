import type { Interaction } from '../utils/preprocess-data';
import { getAllUserActivity } from './fetch-user-activity';
import {
  rankProducts,
  recommendProducts,
  trainRecommender,
} from './recommendation.service';

vi.mock('./fetch-user-activity', () => ({ getAllUserActivity: vi.fn() }));

const userId = 'a'.repeat(24);
const otherId = 'f'.repeat(24);
const products = Array.from({ length: 12 }, (_, i) => ({
  id: i.toString(16).padStart(24, '0'),
  title: `Product ${i}`,
}));
const interaction = (
  user: string,
  index: number,
  actionType: string,
): Interaction => ({ userId: user, productId: products[index].id, actionType });

describe('rankProducts', () => {
  it('is empty for a shopper with no interactions', async () => {
    await expect(
      rankProducts(userId, [interaction(otherId, 0, 'product_view')], products),
    ).resolves.toEqual([]);
  });

  it('returns up to the limit, leaving out products already carted or bought', async () => {
    const interactions = [
      interaction(userId, 0, 'product_view'),
      interaction(userId, 1, 'add_to_cart'),
      interaction(userId, 2, 'purchase'),
      interaction(userId, 3, 'add_to_wishlist'),
      interaction(otherId, 4, 'add_to_cart'),
    ];

    const ranked = await rankProducts(userId, interactions, products, 5);

    expect(ranked).toHaveLength(5);
    expect(new Set(ranked).size).toBe(5);
    for (const product of ranked) expect(products).toContain(product);
    expect(ranked).not.toContain(products[1]);
    expect(ranked).not.toContain(products[2]);
  }, 30_000);
});

describe('trainRecommender', () => {
  it('is null when there are no products', async () => {
    await expect(
      trainRecommender([interaction(userId, 0, 'product_view')], []),
    ).resolves.toBeNull();
  });

  it('serves many shoppers from one model and respects exclude', async () => {
    const recommender = await trainRecommender(
      [
        interaction(userId, 0, 'product_view'),
        interaction(userId, 1, 'add_to_cart'),
        interaction(otherId, 2, 'add_to_wishlist'),
      ],
      products,
    );
    if (!recommender) throw new Error('expected a model');
    try {
      const mine = await recommender.recommend(userId, {
        limit: 20,
        exclude: [products[3].id],
      });
      expect(mine).toHaveLength(products.length - 2);
      expect(mine).not.toContain(products[1]);
      expect(mine).not.toContain(products[3]);

      await expect(
        recommender.recommend(otherId, { limit: 3 }),
      ).resolves.toHaveLength(3);
      await expect(recommender.recommend('9'.repeat(24))).resolves.toEqual([]);
    } finally {
      recommender.dispose();
    }
  }, 30_000);
});

describe('recommendProducts', () => {
  it('trains on stored activity for listed products only', async () => {
    vi.mocked(getAllUserActivity).mockResolvedValue([
      {
        userId,
        productId: 'e'.repeat(24),
        shopId: null,
        action: 'product_view',
        at: new Date(),
      },
    ]);

    await expect(recommendProducts(userId, products)).resolves.toEqual([]);
  });
});
