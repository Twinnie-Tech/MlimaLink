import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { notFound } from '@org/errors';
import type {
  Admin,
  AdminListQuery,
  AdminOrder,
  AdminOverview,
  AdminPayments,
  AdminProduct,
  AdminSeller,
  AdminUser,
  ChartSlice,
  MonthlyPerformance,
  OrderStatus,
  PaginatedResponse,
  TopShop,
} from '@org/models';
import { monthKey, recentMonths } from '@org/models/admin';
import { discountPercent } from '@org/models/catalog';
import { roundMoney } from '@org/models/checkout';
import { DELIVERY_COUNTRY } from '@org/models/delivery';
import { orderFees, type OrderRecord } from '../orders/order-mapper';
import { PrismaService } from '../prisma.service';
import { isObjectId } from '../products/product-mapper';

const RECENT_ORDERS = 8;
const TOP_SHOPS = 5;
const PENDING: OrderStatus[] = ['placed', 'confirmed', 'out_for_delivery'];
const DEVICES: { key: string; label: string }[] = [
  { key: 'mobile', label: 'Mobile' },
  { key: 'tablet', label: 'Tablet' },
  { key: 'desktop', label: 'Desktop' },
];
const STATUS_LABELS: Record<OrderStatus, string> = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/** Just what the money figures need from an order. */
const moneySelect = {
  shopId: true,
  shopName: true,
  status: true,
  subtotal: true,
  discount: true,
  deliveryFee: true,
  platformFee: true,
  sellerEarnings: true,
  createdAt: true,
} satisfies Prisma.ordersSelect;
type MoneyRecord = Prisma.ordersGetPayload<{ select: typeof moneySelect }>;

const goodsOf = (order: Pick<OrderRecord, 'subtotal' | 'discount'>) =>
  roundMoney(Math.max(order.subtotal - order.discount, 0));

const page = <T>(
  items: T[],
  total: number,
  query: AdminListQuery,
): PaginatedResponse<T> => ({
  items,
  total,
  page: query.page,
  pageSize: query.pageSize,
  totalPages: Math.max(Math.ceil(total / query.pageSize), 1),
});

const contains = (search: string) =>
  ({ contains: search, mode: 'insensitive' }) as const;

export function toAdminOrder(record: OrderRecord): AdminOrder {
  return {
    id: record.id,
    number: record.number,
    shopId: record.shopId,
    shopName: record.shopName,
    buyerName: record.buyerName,
    buyerEmail: record.buyerEmail,
    status: record.status as OrderStatus,
    itemCount: record.items.reduce((sum, item) => sum + item.quantity, 0),
    goods: goodsOf(record),
    deliveryFee: record.deliveryFee,
    total: record.total,
    ...orderFees(record),
    createdAt: record.createdAt.toISOString(),
  };
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(now = new Date()): Promise<AdminOverview> {
    const months = recentMonths(now);
    const since = months[0].start;

    const [
      users,
      sellers,
      shops,
      products,
      riders,
      orders,
      newUsers,
      newSellers,
      devices,
      shoppers,
      seenCountries,
      sellerCountries,
      recent,
    ] = await Promise.all([
      this.prisma.users.count(),
      this.prisma.sellers.count(),
      this.prisma.shops.count(),
      this.prisma.products.count(),
      this.prisma.riders.count(),
      this.prisma.orders.findMany({
        select: { ...moneySelect, userId: true },
      }),
      this.prisma.users.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.sellers.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.user_analytics.groupBy({
        by: ['device'],
        _count: { _all: true },
      }),
      this.prisma.users.findMany({ select: { id: true, country: true } }),
      this.prisma.user_analytics.findMany({
        where: { country: { not: null } },
        select: { userId: true, country: true },
      }),
      this.prisma.sellers.groupBy({ by: ['country'], _count: { _all: true } }),
      this.prisma.orders.findMany({
        orderBy: { createdAt: 'desc' },
        take: RECENT_ORDERS,
      }),
    ]);

    const live = orders.filter((order) => order.status !== 'cancelled');
    const totals = sumMoney(live);

    const monthly: MonthlyPerformance[] = months.map(({ month, label }) => {
      const inMonth = live.filter((o) => monthKey(o.createdAt) === month);
      const sums = sumMoney(inMonth);
      return {
        month,
        label,
        sales: sums.sales,
        platformFees: sums.platformFees,
        sellerEarnings: sums.sellerEarnings,
        orders: inMonth.length,
        newUsers: newUsers.filter((u) => monthKey(u.createdAt) === month)
          .length,
        newSellers: newSellers.filter((s) => monthKey(s.createdAt) === month)
          .length,
      };
    });

    const known = new Map(
      devices.map((row) => [row.device ?? '', row._count._all]),
    );
    const deviceSlices: ChartSlice[] = DEVICES.map(({ key, label }) => ({
      label,
      value: known.get(key) ?? 0,
    }));
    const recorded = deviceSlices.reduce((sum, s) => sum + s.value, 0);
    if (users > recorded) {
      deviceSlices.push({ label: 'Not recorded', value: users - recorded });
    }

    const browsedFrom = new Map(
      seenCountries.map((row) => [row.userId, row.country]),
    );
    const ordered = new Set(orders.map((order) => order.userId));
    const countries = new Map<string, { users: number; sellers: number }>();
    for (const shopper of shoppers) {
      // MlimaLink only delivers in Kenya, so shoppers with no known location count there.
      const country =
        shopper.country ??
        (ordered.has(shopper.id) ? null : browsedFrom.get(shopper.id)) ??
        DELIVERY_COUNTRY;
      const entry = countries.get(country) ?? { users: 0, sellers: 0 };
      entry.users += 1;
      countries.set(country, entry);
    }
    for (const row of sellerCountries) {
      const entry = countries.get(row.country) ?? { users: 0, sellers: 0 };
      entry.sellers = row._count._all;
      countries.set(row.country, entry);
    }

    return {
      totals: {
        ...totals,
        orders: orders.length,
        users,
        sellers,
        shops,
        products,
        riders,
      },
      monthly,
      accounts: [
        { label: 'Shoppers', value: users },
        { label: 'Sellers', value: sellers },
        { label: 'Riders', value: riders },
      ],
      devices: deviceSlices,
      countries: [...countries]
        .map(([country, counts]) => ({ country, ...counts }))
        .sort((a, b) => b.users + b.sellers - (a.users + a.sellers)),
      orderStatus: (Object.keys(STATUS_LABELS) as OrderStatus[]).map(
        (status) => ({
          label: STATUS_LABELS[status],
          value: orders.filter((o) => o.status === status).length,
        }),
      ),
      recentOrders: recent.map(toAdminOrder),
      topShops: topShops(live),
    };
  }

  async listUsers(
    query: AdminListQuery,
  ): Promise<PaginatedResponse<AdminUser>> {
    const where: Prisma.usersWhereInput = {
      ...(query.search && {
        OR: [
          { name: contains(query.search) },
          { email: contains(query.search) },
        ],
      }),
      ...(query.suspended !== undefined && { suspended: query.suspended }),
    };
    const [total, records] = await Promise.all([
      this.prisma.users.count({ where }),
      this.prisma.users.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: userSelect,
      }),
    ]);
    return page(await this.withUserStats(records), total, query);
  }

  async setUserSuspended(id: string, suspended: boolean): Promise<AdminUser> {
    const found = isObjectId(id)
      ? await this.prisma.users.findUnique({
          where: { id },
          select: { id: true },
        })
      : null;
    if (!found) throw notFound('User', { id });
    const record = await this.prisma.users.update({
      where: { id },
      data: { suspended },
      select: userSelect,
    });
    const [user] = await this.withUserStats([record]);
    return user;
  }

  async listSellers(
    query: AdminListQuery,
  ): Promise<PaginatedResponse<AdminSeller>> {
    const where: Prisma.sellersWhereInput = {
      ...(query.search && {
        OR: [
          { name: contains(query.search) },
          { email: contains(query.search) },
          { shop: { is: { name: contains(query.search) } } },
        ],
      }),
      ...(query.suspended !== undefined && { suspended: query.suspended }),
    };
    const [total, records] = await Promise.all([
      this.prisma.sellers.count({ where }),
      this.prisma.sellers.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: sellerSelect,
      }),
    ]);
    return page(await this.withSellerStats(records), total, query);
  }

  async setSellerSuspended(
    id: string,
    suspended: boolean,
  ): Promise<AdminSeller> {
    const found = isObjectId(id)
      ? await this.prisma.sellers.findUnique({
          where: { id },
          select: { id: true },
        })
      : null;
    if (!found) throw notFound('Seller', { id });
    const record = await this.prisma.sellers.update({
      where: { id },
      data: { suspended },
      select: sellerSelect,
    });
    const [seller] = await this.withSellerStats([record]);
    return seller;
  }

  async listOrders(
    query: AdminListQuery,
  ): Promise<PaginatedResponse<AdminOrder>> {
    const where = orderWhere(query);
    const [total, records] = await Promise.all([
      this.prisma.orders.count({ where }),
      this.prisma.orders.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return page(records.map(toAdminOrder), total, query);
  }

  async listProducts(
    query: AdminListQuery,
  ): Promise<PaginatedResponse<AdminProduct>> {
    const where: Prisma.productsWhereInput = {
      ...(query.search && {
        OR: [
          { title: contains(query.search) },
          { category: contains(query.search) },
          { subCategory: contains(query.search) },
          { shop: { is: { name: contains(query.search) } } },
        ],
      }),
      // Sellers can only set a sale price below the price.
      ...(query.onSale && { salePrice: { not: null } }),
    };
    const [total, records] = await Promise.all([
      this.prisma.products.count({ where }),
      this.prisma.products.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: productSelect,
      }),
    ]);
    return page(records.map(toAdminProduct), total, query);
  }

  async listAdmins(query: AdminListQuery): Promise<PaginatedResponse<Admin>> {
    const where: Prisma.adminsWhereInput = query.search
      ? {
          OR: [
            { name: contains(query.search) },
            { email: contains(query.search) },
          ],
        }
      : {};
    const [total, records] = await Promise.all([
      this.prisma.admins.count({ where }),
      this.prisma.admins.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: adminSelect,
      }),
    ]);
    return page(
      records.map((record) => ({
        ...record,
        lastLoginAt: record.lastLoginAt?.toISOString() ?? null,
        createdAt: record.createdAt.toISOString(),
      })),
      total,
      query,
    );
  }

  /** Orders that weren't cancelled, with what MlimaLink and the shop each get. */
  async payments(query: AdminListQuery): Promise<AdminPayments> {
    const where: Prisma.ordersWhereInput = {
      ...orderWhere(query),
      ...(!query.status && { status: { not: 'cancelled' } }),
    };
    const [all, total, records] = await Promise.all([
      this.prisma.orders.findMany({
        where: { status: { not: 'cancelled' } },
        select: moneySelect,
      }),
      this.prisma.orders.count({ where }),
      this.prisma.orders.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const settled = sumMoney(all.filter((o) => o.status === 'delivered'));
    const pending = sumMoney(
      all.filter((o) => PENDING.includes(o.status as OrderStatus)),
    );
    return {
      ...page(records.map(toAdminOrder), total, query),
      summary: {
        platformFees: settled.platformFees,
        sellerEarnings: settled.sellerEarnings,
        deliveryFees: settled.deliveryFees,
        pendingPlatformFees: pending.platformFees,
        pendingSellerEarnings: pending.sellerEarnings,
      },
    };
  }

  private async withUserStats(
    records: Prisma.usersGetPayload<{ select: typeof userSelect }>[],
  ): Promise<AdminUser[]> {
    const stats = records.length
      ? await this.prisma.orders.groupBy({
          by: ['userId'],
          where: {
            userId: { in: records.map((r) => r.id) },
            status: { not: 'cancelled' },
          },
          _count: { _all: true },
          _sum: { total: true },
        })
      : [];
    const byUser = new Map(stats.map((row) => [row.userId, row]));
    return records.map((record) => {
      const row = byUser.get(record.id);
      return {
        id: record.id,
        name: record.name,
        email: record.email,
        avatarUrl: record.avatar[0]?.url ?? null,
        country: record.country,
        suspended: record.suspended,
        orders: row?._count._all ?? 0,
        spent: roundMoney(row?._sum.total ?? 0),
        createdAt: record.createdAt.toISOString(),
      };
    });
  }

  private async withSellerStats(
    records: Prisma.sellersGetPayload<{ select: typeof sellerSelect }>[],
  ): Promise<AdminSeller[]> {
    const shopIds = records.flatMap((r) => (r.shop ? [r.shop.id] : []));
    const orders = shopIds.length
      ? await this.prisma.orders.findMany({
          where: { shopId: { in: shopIds }, status: { not: 'cancelled' } },
          select: moneySelect,
        })
      : [];
    return records.map((record) => {
      const mine = record.shop
        ? orders.filter((o) => o.shopId === record.shop?.id)
        : [];
      const delivered = sumMoney(mine.filter((o) => o.status === 'delivered'));
      return {
        id: record.id,
        name: record.name,
        email: record.email,
        avatarUrl: record.shop?.avatar[0]?.url ?? null,
        phone: record.phone_number,
        country: record.country,
        suspended: record.suspended,
        shop: record.shop
          ? { id: record.shop.id, name: record.shop.name }
          : null,
        payoutsConnected: Boolean(record.stripeId),
        orders: mine.length,
        earnings: delivered.sellerEarnings,
        platformFees: delivered.platformFees,
        createdAt: record.createdAt.toISOString(),
      };
    });
  }
}

const avatarSelect = { select: { url: true }, take: 1 } as const;

const userSelect = {
  id: true,
  name: true,
  email: true,
  country: true,
  suspended: true,
  createdAt: true,
  avatar: avatarSelect,
} satisfies Prisma.usersSelect;

const sellerSelect = {
  id: true,
  name: true,
  email: true,
  phone_number: true,
  country: true,
  stripeId: true,
  suspended: true,
  createdAt: true,
  shop: { select: { id: true, name: true, avatar: avatarSelect } },
} satisfies Prisma.sellersSelect;

const productSelect = {
  id: true,
  title: true,
  images: true,
  price: true,
  salePrice: true,
  stock: true,
  category: true,
  subCategory: true,
  ratings: true,
  reviewCount: true,
  shopId: true,
  createdAt: true,
  shop: { select: { name: true } },
} satisfies Prisma.productsSelect;

const adminSelect = {
  id: true,
  name: true,
  email: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.adminsSelect;

export function toAdminProduct(
  record: Prisma.productsGetPayload<{ select: typeof productSelect }>,
): AdminProduct {
  const salePrice = record.salePrice ?? null;
  const cover = record.images[0];
  return {
    id: record.id,
    title: record.title,
    // Older listings keep photos inline as data URLs, far too big for a list.
    imageUrl: cover?.startsWith('http') ? cover : null,
    price: record.price,
    salePrice,
    discountPercent: discountPercent({
      price: record.price,
      salePrice: salePrice ?? undefined,
    }),
    stock: record.stock,
    category: record.category,
    subCategory: record.subCategory,
    rating: record.ratings,
    reviewCount: record.reviewCount,
    shopId: record.shopId,
    shopName: record.shop.name,
    createdAt: record.createdAt.toISOString(),
  };
}

function orderWhere(query: AdminListQuery): Prisma.ordersWhereInput {
  return {
    ...(query.status && { status: query.status }),
    ...(query.search && {
      OR: [
        { number: contains(query.search) },
        { shopName: contains(query.search) },
        { buyerName: contains(query.search) },
        { buyerEmail: contains(query.search) },
      ],
    }),
  };
}

function sumMoney(orders: MoneyRecord[]) {
  let sales = 0;
  let platformFees = 0;
  let sellerEarnings = 0;
  let deliveryFees = 0;
  for (const order of orders) {
    const fees = orderFees(order);
    sales += goodsOf(order);
    platformFees += fees.platformFee;
    sellerEarnings += fees.sellerEarnings;
    deliveryFees += order.deliveryFee;
  }
  return {
    sales: roundMoney(sales),
    platformFees: roundMoney(platformFees),
    sellerEarnings: roundMoney(sellerEarnings),
    deliveryFees: roundMoney(deliveryFees),
  };
}

function topShops(orders: MoneyRecord[]): TopShop[] {
  const shops = new Map<string, MoneyRecord[]>();
  for (const order of orders) {
    shops.set(order.shopId, [...(shops.get(order.shopId) ?? []), order]);
  }
  return [...shops.values()]
    .map((list) => {
      const sums = sumMoney(list);
      return {
        shopId: list[0].shopId,
        shopName: list[0].shopName,
        orders: list.length,
        sales: sums.sales,
        platformFees: sums.platformFees,
      };
    })
    .sort((a, b) => b.sales - a.sales)
    .slice(0, TOP_SHOPS);
}
