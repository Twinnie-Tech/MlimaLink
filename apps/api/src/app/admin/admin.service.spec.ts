import { parseAdminListQuery } from '@org/models/admin';
import type { PrismaService } from '../prisma.service';
import { SHOP_ID, USER_ID, orderRecord } from '../orders/test-fixtures';
import { AdminService } from './admin.service';

const OTHER_SHOP = '7'.repeat(24);
const SELLER_ID = '8'.repeat(24);
const NOW = new Date('2026-10-07T12:00:00Z');

function mockPrisma() {
  const model = () => ({
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
    groupBy: vi.fn().mockResolvedValue([]),
  });
  return {
    users: model(),
    sellers: model(),
    shops: model(),
    products: model(),
    riders: model(),
    orders: model(),
    user_analytics: model(),
    admins: model(),
  };
}

describe('AdminService', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  let service: AdminService;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new AdminService(prisma as unknown as PrismaService);
  });

  describe('overview', () => {
    beforeEach(() => {
      prisma.users.count.mockResolvedValue(10);
      prisma.sellers.count.mockResolvedValue(3);
      prisma.riders.count.mockResolvedValue(2);
      prisma.orders.findMany.mockImplementation(async (args) =>
        args?.select
          ? [
              // This month: 100 of goods, fee stored at checkout.
              orderRecord({
                status: 'delivered',
                createdAt: new Date('2026-10-03T10:00:00Z'),
              }),
              // Last month, before fees were stored: worked out at 10%.
              orderRecord({
                shopId: OTHER_SHOP,
                shopName: 'Chai Corner',
                subtotal: 50,
                discount: 10,
                platformFee: null,
                sellerEarnings: null,
                status: 'placed',
                createdAt: new Date('2026-09-15T10:00:00Z'),
              }),
              // Cancelled orders don't count towards money.
              orderRecord({
                status: 'cancelled',
                createdAt: new Date('2026-10-02T10:00:00Z'),
              }),
            ]
          : [orderRecord()],
      );
      prisma.users.findMany.mockImplementation(async (args) =>
        args?.select?.id
          ? [
              { id: 'u1', country: 'KE' },
              { id: 'u3', country: null },
              { id: USER_ID, country: null },
              // Nothing known about this shopper, so they count in Kenya.
              { id: 'u5', country: null },
            ]
          : [
              { createdAt: new Date('2026-10-01T00:00:00Z') },
              { createdAt: new Date('2026-05-20T00:00:00Z') },
            ],
      );
      prisma.user_analytics.findMany.mockResolvedValue([
        // u1's profile says Kenya, so where they browsed from is ignored.
        { userId: 'u1', country: 'UG' },
        { userId: 'u3', country: 'TZ' },
        // This shopper's orders were delivered in Kenya.
        { userId: USER_ID, country: 'UG' },
      ]);
      prisma.sellers.findMany.mockResolvedValue([
        { createdAt: new Date('2026-08-03T00:00:00Z') },
      ]);
      prisma.user_analytics.groupBy.mockResolvedValue([
        { device: 'mobile', _count: { _all: 5 } },
        { device: 'desktop', _count: { _all: 3 } },
      ]);
      prisma.sellers.groupBy.mockResolvedValue([
        { country: 'KE', _count: { _all: 2 } },
        { country: 'UG', _count: { _all: 1 } },
      ]);
    });

    it('totals money from orders that were not cancelled', async () => {
      const { totals } = await service.overview(NOW);

      expect(totals).toMatchObject({
        sales: 140,
        platformFees: 14,
        sellerEarnings: 126,
        deliveryFees: 10,
        orders: 3,
        users: 10,
        sellers: 3,
        riders: 2,
      });
    });

    it('charts the last six months, oldest first', async () => {
      const { monthly } = await service.overview(NOW);

      expect(monthly.map((m) => m.month)).toEqual([
        '2026-05',
        '2026-06',
        '2026-07',
        '2026-08',
        '2026-09',
        '2026-10',
      ]);
      expect(monthly[0]).toMatchObject({ label: 'May', newUsers: 1 });
      expect(monthly[3]).toMatchObject({ newSellers: 1, orders: 0 });
      expect(monthly[4]).toMatchObject({
        orders: 1,
        sales: 40,
        platformFees: 4,
        sellerEarnings: 36,
      });
      expect(monthly[5]).toMatchObject({
        orders: 1,
        sales: 100,
        platformFees: 10,
        newUsers: 1,
      });
    });

    it('breaks down accounts, devices and countries', async () => {
      const overview = await service.overview(NOW);

      expect(overview.accounts).toEqual([
        { label: 'Shoppers', value: 10 },
        { label: 'Sellers', value: 3 },
        { label: 'Riders', value: 2 },
      ]);
      expect(overview.devices).toEqual([
        { label: 'Mobile', value: 5 },
        { label: 'Tablet', value: 0 },
        { label: 'Desktop', value: 3 },
        { label: 'Not recorded', value: 2 },
      ]);
      expect(overview.countries).toEqual([
        { country: 'KE', users: 3, sellers: 2 },
        { country: 'TZ', users: 1, sellers: 0 },
        { country: 'UG', users: 0, sellers: 1 },
      ]);
      expect(overview.orderStatus).toContainEqual({
        label: 'Cancelled',
        value: 1,
      });
    });

    it('lists recent orders and the top shops with their fees', async () => {
      const overview = await service.overview(NOW);

      expect(overview.recentOrders[0]).toMatchObject({
        number: 'ML-7Q2K9D',
        goods: 100,
        platformFee: 10,
        sellerEarnings: 90,
        itemCount: 2,
      });
      expect(overview.topShops).toEqual([
        {
          shopId: SHOP_ID,
          shopName: 'Kicks KE',
          orders: 1,
          sales: 100,
          platformFees: 10,
        },
        {
          shopId: OTHER_SHOP,
          shopName: 'Chai Corner',
          orders: 1,
          sales: 40,
          platformFees: 4,
        },
      ]);
    });
  });

  describe('users', () => {
    const userRecord = {
      id: USER_ID,
      name: 'Amina',
      email: 'amina@example.com',
      country: 'KE',
      suspended: false,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      avatar: [{ url: 'https://ik.imagekit.io/mlima/amina.jpg' }],
    };

    it('searches and pages shoppers with their order totals', async () => {
      prisma.users.count.mockResolvedValue(41);
      prisma.users.findMany.mockResolvedValue([userRecord]);
      prisma.orders.groupBy.mockResolvedValue([
        { userId: USER_ID, _count: { _all: 2 }, _sum: { total: 210 } },
      ]);

      const result = await service.listUsers(
        parseAdminListQuery({ search: ' amina ', page: '3' }),
      );

      const args = prisma.users.findMany.mock.calls[0][0];
      expect(args.where.OR[1]).toEqual({
        email: { contains: 'amina', mode: 'insensitive' },
      });
      expect(args.skip).toBe(40);
      expect(result).toMatchObject({ total: 41, page: 3, totalPages: 3 });
      expect(result.items[0]).toMatchObject({
        orders: 2,
        spent: 210,
        avatarUrl: 'https://ik.imagekit.io/mlima/amina.jpg',
      });
    });

    it('suspends a shopper', async () => {
      prisma.users.findUnique.mockResolvedValue({ id: USER_ID });
      prisma.users.update.mockResolvedValue({ ...userRecord, suspended: true });

      const user = await service.setUserSuspended(USER_ID, true);

      expect(prisma.users.update.mock.calls[0][0]).toMatchObject({
        where: { id: USER_ID },
        data: { suspended: true },
      });
      expect(user.suspended).toBe(true);
    });

    it('answers 404 for an unknown shopper', async () => {
      await expect(
        service.setUserSuspended('not-an-id', true),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(prisma.users.update).not.toHaveBeenCalled();
    });
  });

  it("works out sellers' earnings and fees from delivered orders", async () => {
    prisma.sellers.count.mockResolvedValue(1);
    prisma.sellers.findMany.mockResolvedValue([
      {
        id: SELLER_ID,
        name: 'Juma',
        email: 'juma@example.com',
        phone_number: '+254700000000',
        country: 'KE',
        stripeId: null,
        suspended: false,
        createdAt: new Date('2026-08-01T00:00:00Z'),
        shop: {
          id: SHOP_ID,
          name: 'Kicks KE',
          avatar: [{ url: 'https://ik.imagekit.io/mlima/kicks.png' }],
        },
      },
    ]);
    prisma.orders.findMany.mockResolvedValue([
      orderRecord({ status: 'delivered' }),
      orderRecord({ status: 'confirmed' }),
    ]);

    const { items } = await service.listSellers(parseAdminListQuery({}));

    expect(items[0].shop).toEqual({ id: SHOP_ID, name: 'Kicks KE' });
    expect(items[0]).toMatchObject({
      avatarUrl: 'https://ik.imagekit.io/mlima/kicks.png',
      payoutsConnected: false,
      orders: 2,
      earnings: 90,
      platformFees: 10,
    });
  });

  it('splits payments into settled and pending', async () => {
    prisma.orders.count.mockResolvedValue(2);
    prisma.orders.findMany.mockImplementation(async (args) =>
      args?.select
        ? [
            orderRecord({ status: 'delivered' }),
            orderRecord({
              status: 'out_for_delivery',
              platformFee: 5,
              sellerEarnings: 45,
            }),
          ]
        : [orderRecord({ status: 'delivered' })],
    );

    const result = await service.payments(parseAdminListQuery({}));

    expect(result.summary).toEqual({
      platformFees: 10,
      sellerEarnings: 90,
      deliveryFees: 5,
      pendingPlatformFees: 5,
      pendingSellerEarnings: 45,
    });
    const listed = prisma.orders.findMany.mock.calls.find(([a]) => !a.select);
    expect(listed?.[0].where.status).toEqual({ not: 'cancelled' });
    expect(result.items[0]).toMatchObject({ platformFee: 10 });
  });

  describe('products', () => {
    const productRecord = (overrides: Record<string, unknown> = {}) => ({
      id: 'p'.repeat(24),
      title: 'Hass avocados',
      images: ['https://ik.imagekit.io/mlima/avocado.jpg'],
      price: 10,
      salePrice: 8,
      stock: 39,
      category: 'Fruits & Vegetables',
      subCategory: 'Fruits',
      ratings: 4.5,
      reviewCount: 2,
      shopId: SHOP_ID,
      createdAt: new Date('2026-10-01T00:00:00Z'),
      shop: { name: 'Kicks KE' },
      ...overrides,
    });

    it('lists products with their shop and discount', async () => {
      prisma.products.count.mockResolvedValue(1);
      prisma.products.findMany.mockResolvedValue([productRecord()]);

      const result = await service.listProducts(
        parseAdminListQuery({ search: 'kicks' }),
      );

      const args = prisma.products.findMany.mock.calls[0][0];
      expect(args.where.OR).toContainEqual({
        shop: { is: { name: { contains: 'kicks', mode: 'insensitive' } } },
      });
      expect(args.where.salePrice).toBeUndefined();
      expect(result.items[0]).toEqual({
        id: 'p'.repeat(24),
        title: 'Hass avocados',
        imageUrl: 'https://ik.imagekit.io/mlima/avocado.jpg',
        price: 10,
        salePrice: 8,
        discountPercent: 20,
        stock: 39,
        category: 'Fruits & Vegetables',
        subCategory: 'Fruits',
        rating: 4.5,
        reviewCount: 2,
        shopId: SHOP_ID,
        shopName: 'Kicks KE',
        createdAt: '2026-10-01T00:00:00.000Z',
      });
    });

    it('keeps to products on sale for events and leaves out inline photos', async () => {
      prisma.products.findMany.mockResolvedValue([
        productRecord({
          images: ['data:image/png;base64,AAAA'],
          salePrice: null,
        }),
      ]);

      const result = await service.listProducts(
        parseAdminListQuery({ onSale: 'true' }),
      );

      expect(prisma.products.findMany.mock.calls[0][0].where).toEqual({
        salePrice: { not: null },
      });
      expect(result.items[0]).toMatchObject({
        imageUrl: null,
        salePrice: null,
        discountPercent: 0,
      });
    });
  });

  it('lists admin accounts without their passwords', async () => {
    prisma.admins.count.mockResolvedValue(1);
    prisma.admins.findMany.mockResolvedValue([
      {
        id: 'a1',
        name: 'Wanjiku',
        email: 'admin@mlimalink.com',
        lastLoginAt: null,
        createdAt: new Date('2026-10-01T00:00:00Z'),
      },
    ]);

    const result = await service.listAdmins(parseAdminListQuery({}));

    expect(prisma.admins.findMany.mock.calls[0][0].select).not.toHaveProperty(
      'password',
    );
    expect(result.items).toEqual([
      {
        id: 'a1',
        name: 'Wanjiku',
        email: 'admin@mlimalink.com',
        lastLoginAt: null,
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    ]);
  });
});
