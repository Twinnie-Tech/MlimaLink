import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { notFound } from '@org/errors';
import type {
  OpeningDay,
  PaginatedResponse,
  ShopDetail,
  ShopFilter,
  ShopSummary,
} from '@org/models';
import { DEFAULT_DELIVERY_FEE } from '@org/models/delivery';
import { PrismaService } from '../prisma.service';
import {
  isObjectId,
  productWithShop,
  toProduct,
} from '../products/product-mapper';

/** A shop page lists at most this many products; `productCount` still has the full number. */
const MAX_SHOP_PRODUCTS = 120;

const shopSummarySelect = {
  id: true,
  name: true,
  bio: true,
  category: true,
  address: true,
  deliveryZone: true,
  coverBanner: true,
  ratings: true,
  opening_hours: true,
  createdAt: true,
  avatar: { select: { url: true }, take: 1 },
  _count: { select: { products: true, reviews: true } },
} satisfies Prisma.shopsSelect;

const shopDetailSelect = {
  ...shopSummarySelect,
  website: true,
  socialLinks: true,
  deliveryFee: true,
  serviceProfile: { select: { id: true } },
} satisfies Prisma.shopsSelect;

type ShopSummaryRecord = Prisma.shopsGetPayload<{
  select: typeof shopSummarySelect;
}>;

/** A stored shop as the directory shows it. Prisma's nulls become missing fields. */
export function toShopSummary(record: ShopSummaryRecord): ShopSummary {
  const avatarUrl = record.avatar[0]?.url;
  return {
    id: record.id,
    name: record.name,
    ...(record.bio && { bio: record.bio }),
    category: record.category,
    address: record.address,
    ...(record.deliveryZone && { deliveryZone: record.deliveryZone }),
    ...(avatarUrl && { avatarUrl }),
    ...(record.coverBanner && { coverBanner: record.coverBanner }),
    rating: record.ratings,
    reviewCount: record._count.reviews,
    productCount: record._count.products,
    openingHours: record.opening_hours.map(({ day, open, close }) => ({
      day: day as OpeningDay['day'],
      open,
      close,
    })),
    createdAt: record.createdAt.toISOString(),
  };
}

export function shopWhere(filter: ShopFilter): Prisma.shopsWhereInput {
  const search = filter.search?.trim();
  const matches = { contains: search, mode: 'insensitive' as const };
  return {
    ...(filter.category && { category: filter.category }),
    ...(filter.zone && { deliveryZone: filter.zone }),
    ...(search && {
      OR: [{ name: matches }, { bio: matches }, { address: matches }],
    }),
  };
}

@Injectable()
export class ShopsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Best rated first, then newest. */
  async listShops(
    filter: ShopFilter = {},
    page = 1,
    pageSize = 12,
  ): Promise<PaginatedResponse<ShopSummary>> {
    const where = shopWhere(filter);
    const [records, total] = await Promise.all([
      this.prisma.shops.findMany({
        where,
        select: shopSummarySelect,
        orderBy: [{ ratings: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.shops.count({ where }),
    ]);
    return {
      items: records.map(toShopSummary),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** A shop's public page with its newest products, or a 404. */
  async getShop(id: string): Promise<ShopDetail> {
    const record = isObjectId(id)
      ? await this.prisma.shops.findUnique({
          where: { id },
          select: shopDetailSelect,
        })
      : null;
    if (!record) throw notFound('Shop', { id });

    const products = await this.prisma.products.findMany({
      where: { shopId: id },
      orderBy: { createdAt: 'desc' },
      take: MAX_SHOP_PRODUCTS,
      include: productWithShop,
    });

    return {
      ...toShopSummary(record),
      ...(record.website && { website: record.website }),
      socialLinks: record.socialLinks.map(({ platform, url }) => ({
        platform,
        url,
      })),
      deliveryFee: record.deliveryFee ?? DEFAULT_DELIVERY_FEE,
      isProvider: record.serviceProfile !== null,
      products: products.map(toProduct),
    };
  }
}
