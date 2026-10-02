import type { PrismaService } from '../prisma.service';
import { ShopsService, shopWhere } from './shops.service';

const shopId = 'a'.repeat(24);

const storedShop = (overrides: Record<string, unknown> = {}) => ({
  id: shopId,
  name: 'Mlima Farm',
  bio: null,
  category: 'Food & Groceries',
  address: 'Gakere Road, Nyeri',
  deliveryZone: 'Nyeri',
  coverBanner: null,
  ratings: 4.5,
  opening_hours: [{ day: 'mon', open: '08:00', close: '17:00' }],
  createdAt: new Date('2026-09-01T10:00:00Z'),
  avatar: [{ url: 'https://ik.imagekit.io/mlima/avatar.jpg' }],
  _count: { products: 2, reviews: 3 },
  ...overrides,
});

const storedProduct = {
  id: 'b'.repeat(24),
  title: 'Honey',
  shortDescription: 'Raw forest honey',
  description: 'Raw forest honey',
  price: 10,
  salePrice: null,
  category: 'Food & Groceries',
  subCategory: 'Honey',
  tags: [],
  images: ['https://ik.imagekit.io/mlima/honey.jpg'],
  imageFileIds: [],
  specs: [],
  options: [],
  variants: [],
  stock: 4,
  paymentOptions: [],
  ratings: 0,
  reviewCount: 0,
  shopId,
  shop: {
    name: 'Mlima Farm',
    seller: { phone_number: '+254700000000', email: 'farm@example.com' },
  },
};

describe('shopWhere', () => {
  it('filters by category and delivery town', () => {
    expect(shopWhere({ category: 'Fashion', zone: 'Meru' })).toEqual({
      category: 'Fashion',
      deliveryZone: 'Meru',
    });
  });

  it('searches name, description and address without case', () => {
    const matches = { contains: 'honey', mode: 'insensitive' };
    expect(shopWhere({ search: '  honey ' })).toEqual({
      OR: [{ name: matches }, { bio: matches }, { address: matches }],
    });
  });

  it('ignores empty filters', () => {
    expect(shopWhere({ search: ' ', category: '', zone: undefined })).toEqual(
      {},
    );
  });
});

describe('ShopsService', () => {
  const prisma = {
    shops: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    products: { findMany: vi.fn() },
  };
  const service = new ShopsService(prisma as unknown as PrismaService);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('lists a page of shops with their counts', async () => {
    prisma.shops.findMany.mockResolvedValue([storedShop()]);
    prisma.shops.count.mockResolvedValue(13);

    const result = await service.listShops({ zone: 'Nyeri' }, 2, 12);

    expect(prisma.shops.findMany.mock.calls[0][0]).toMatchObject({
      where: { deliveryZone: 'Nyeri' },
      skip: 12,
      take: 12,
    });
    expect(result).toMatchObject({ total: 13, page: 2, totalPages: 2 });
    expect(result.items).toEqual([
      {
        id: shopId,
        name: 'Mlima Farm',
        category: 'Food & Groceries',
        address: 'Gakere Road, Nyeri',
        deliveryZone: 'Nyeri',
        avatarUrl: 'https://ik.imagekit.io/mlima/avatar.jpg',
        rating: 4.5,
        reviewCount: 3,
        productCount: 2,
        openingHours: [{ day: 'mon', open: '08:00', close: '17:00' }],
        createdAt: '2026-09-01T10:00:00.000Z',
      },
    ]);
  });

  it('returns a shop with its products and delivery fee', async () => {
    prisma.shops.findUnique.mockResolvedValue(
      storedShop({
        website: 'https://mlimafarm.co.ke',
        socialLinks: [
          { platform: 'instagram', url: 'https://instagram.com/mlima' },
        ],
        deliveryFee: null,
        serviceProfile: null,
      }),
    );
    prisma.products.findMany.mockResolvedValue([storedProduct]);

    const shop = await service.getShop(shopId);

    expect(prisma.products.findMany.mock.calls[0][0]).toMatchObject({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
    });
    expect(shop).toMatchObject({
      name: 'Mlima Farm',
      website: 'https://mlimafarm.co.ke',
      socialLinks: [
        { platform: 'instagram', url: 'https://instagram.com/mlima' },
      ],
      deliveryFee: 3,
      isProvider: false,
    });
    expect(shop.products).toHaveLength(1);
    expect(shop.products[0]).toMatchObject({
      name: 'Honey',
      shopId,
      shopName: 'Mlima Farm',
    });
    // Ordinary listings don't expose the seller's contact details.
    expect(shop.products[0].contact).toBeUndefined();
  });

  it('answers 404 for unknown and malformed ids', async () => {
    prisma.shops.findUnique.mockResolvedValue(null);

    await expect(service.getShop(shopId)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.getShop('not-an-id')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(prisma.shops.findUnique).toHaveBeenCalledTimes(1);
  });
});
