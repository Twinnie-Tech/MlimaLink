import type { Order } from '@org/models';
import { sendUserEvent, sendUserEvents } from '@org/utils/events';
import type { PrismaService } from '../prisma.service';
import { EventsService } from './events.service';

vi.mock('@org/utils/events', () => ({
  sendUserEvent: vi.fn(),
  sendUserEvents: vi.fn(),
}));

const userId = 'a'.repeat(24);
const shopId = 'b'.repeat(24);
const productId = 'c'.repeat(24);

describe('EventsService', () => {
  const prisma = {
    shops: { findUnique: vi.fn() },
    products: { findUnique: vi.fn() },
  };
  const service = new EventsService(prisma as unknown as PrismaService);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('publishes a visit to a shop that exists', async () => {
    prisma.shops.findUnique.mockResolvedValue({ id: shopId });

    expect(await service.track(userId, { action: 'shop_visit', shopId })).toBe(
      true,
    );
    expect(sendUserEvent).toHaveBeenCalledWith({
      userId,
      action: 'shop_visit',
      shopId,
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it('takes a product’s shop from the database, not the client', async () => {
    prisma.products.findUnique.mockResolvedValue({ id: productId, shopId });

    await service.track(userId, {
      action: 'add_to_wishlist',
      productId,
      shopId: 'd'.repeat(24),
    });

    expect(sendUserEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'add_to_wishlist',
        productId,
        shopId,
      }),
    );
  });

  it('sends nothing for listings that aren’t in the database', async () => {
    prisma.products.findUnique.mockResolvedValue(null);
    prisma.shops.findUnique.mockResolvedValue(null);

    expect(
      await service.track(userId, { action: 'add_to_cart', productId }),
    ).toBe(false);
    expect(await service.track(userId, { action: 'shop_visit', shopId })).toBe(
      false,
    );
    expect(sendUserEvent).not.toHaveBeenCalled();
  });

  it('publishes a purchase for every line of every order', () => {
    const otherShop = 'e'.repeat(24);
    const order = (shop: string, ...productIds: string[]) =>
      ({
        shopId: shop,
        items: productIds.map((id) => ({ productId: id })),
      }) as Order;

    service.trackPurchases(userId, [
      order(shopId, productId, 'd'.repeat(24)),
      order(otherShop, 'f'.repeat(24)),
    ]);

    const purchase = (id: string, shop: string) => ({
      userId,
      action: 'purchase',
      productId: id,
      shopId: shop,
      timestamp: expect.any(String),
    });
    expect(sendUserEvents).toHaveBeenCalledWith([
      purchase(productId, shopId),
      purchase('d'.repeat(24), shopId),
      purchase('f'.repeat(24), otherShop),
    ]);
  });
});
