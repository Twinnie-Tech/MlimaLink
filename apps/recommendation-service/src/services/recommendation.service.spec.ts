import type { Interaction } from '../utils/preprocess-data';
import { getAllUserActivity } from './fetch-user-activity';
import { rankProducts, recommendProducts } from './recommendation.service';

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
