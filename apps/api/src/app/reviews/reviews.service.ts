import { Injectable } from '@nestjs/common';
import { notFound } from '@org/errors';
import type {
  Review,
  ReviewInput,
  ReviewPage,
  ReviewSummary,
} from '@org/models';
import { reviewerName } from '@org/models/reviews';
import { PrismaService } from '../prisma.service';
import { isObjectId } from '../products/product-mapper';

const withAuthor = { user: { select: { name: true } } } as const;

type StoredReview = {
  id: string;
  rating: number;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
  user: { name: string };
};

type RatingGroup = { rating: number; _count: { _all: number } };

const roundRating = (value: number) => Math.round(value * 10) / 10;

export function toReview(record: StoredReview, comment: string | null): Review {
  return {
    id: record.id,
    rating: Math.round(record.rating),
    ...(comment && { comment }),
    authorName: reviewerName(record.user.name),
    verified: record.verified,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** Totals for every review from counts grouped by rating. */
export function summarize(groups: RatingGroup[]): ReviewSummary {
  const breakdown: ReviewSummary['breakdown'] = [0, 0, 0, 0, 0];
  let count = 0;
  let total = 0;
  for (const { rating, _count } of groups) {
    const stars = Math.min(5, Math.max(1, Math.round(rating)));
    breakdown[stars - 1] += _count._all;
    count += _count._all;
    total += rating * _count._all;
  }
  return {
    average: count ? roundRating(total / count) : 0,
    count,
    breakdown,
  };
}

const emptyPage = (page: number, pageSize: number): ReviewPage => ({
  items: [],
  total: 0,
  page,
  pageSize,
  totalPages: 0,
  summary: summarize([]),
});

/**
 * Product and shop reviews. A shopper has one review per product and per shop;
 * posting again replaces it. Each change recalculates the stored average.
 */
@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async listProductReviews(
    productId: string,
    page: number,
    pageSize: number,
    userId?: string,
  ): Promise<ReviewPage> {
    // Sample catalogue products have short ids and can't be reviewed.
    if (!isObjectId(productId)) return emptyPage(page, pageSize);
    const where = { productId };
    const [records, total, groups, mine] = await Promise.all([
      this.prisma.product_reviews.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: withAuthor,
      }),
      this.prisma.product_reviews.count({ where }),
      this.prisma.product_reviews.groupBy({
        by: ['rating'],
        where,
        _count: { _all: true },
      }),
      userId
        ? this.prisma.product_reviews.findUnique({
            where: { userId_productId: { userId, productId } },
            include: withAuthor,
          })
        : null,
    ]);
    return {
      items: records.map((record) => toReview(record, record.comment)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      summary: summarize(groups),
      ...(mine && { mine: toReview(mine, mine.comment) }),
    };
  }

  async saveProductReview(
    userId: string,
    productId: string,
    input: ReviewInput,
  ): Promise<{ review: Review; updated: boolean }> {
    const product = isObjectId(productId)
      ? await this.prisma.products.findUnique({
          where: { id: productId },
          select: { id: true },
        })
      : null;
    if (!product) throw notFound('Product', { id: productId });

    const key = { userId_productId: { userId, productId } };
    const [existing, deliveredOrders] = await Promise.all([
      this.prisma.product_reviews.findUnique({
        where: key,
        select: { id: true },
      }),
      this.prisma.orders.count({
        where: {
          userId,
          status: 'delivered',
          items: { some: { productId } },
        },
      }),
    ]);
    const fields = {
      rating: input.rating,
      comment: input.comment ?? null,
      verified: deliveredOrders > 0,
    };
    const record = await this.prisma.product_reviews.upsert({
      where: key,
      create: { userId, productId, ...fields },
      update: fields,
      include: withAuthor,
    });

    const stats = await this.prisma.product_reviews.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await this.prisma.products.update({
      where: { id: productId },
      data: {
        ratings: roundRating(stats._avg.rating ?? 0),
        reviewCount: stats._count._all,
      },
    });

    return {
      review: toReview(record, record.comment),
      updated: existing !== null,
    };
  }

  async listShopReviews(
    shopId: string,
    page: number,
    pageSize: number,
    userId?: string,
  ): Promise<ReviewPage> {
    if (!isObjectId(shopId)) throw notFound('Shop', { id: shopId });
    const where = { shopId };
    const [records, total, groups, mine] = await Promise.all([
      this.prisma.shop_reviews.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: withAuthor,
      }),
      this.prisma.shop_reviews.count({ where }),
      this.prisma.shop_reviews.groupBy({
        by: ['rating'],
        where,
        _count: { _all: true },
      }),
      userId
        ? this.prisma.shop_reviews.findUnique({
            where: { userId_shopId: { userId, shopId } },
            include: withAuthor,
          })
        : null,
    ]);
    return {
      items: records.map((record) => toReview(record, record.reviews)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      summary: summarize(groups),
      ...(mine && { mine: toReview(mine, mine.reviews) }),
    };
  }

  async saveShopReview(
    userId: string,
    shopId: string,
    input: ReviewInput,
  ): Promise<{ review: Review; updated: boolean }> {
    const shop = isObjectId(shopId)
      ? await this.prisma.shops.findUnique({
          where: { id: shopId },
          select: { id: true },
        })
      : null;
    if (!shop) throw notFound('Shop', { id: shopId });

    const key = { userId_shopId: { userId, shopId } };
    const [existing, deliveredOrders] = await Promise.all([
      this.prisma.shop_reviews.findUnique({
        where: key,
        select: { id: true },
      }),
      this.prisma.orders.count({
        where: { userId, shopId, status: 'delivered' },
      }),
    ]);
    const fields = {
      rating: input.rating,
      reviews: input.comment ?? null,
      verified: deliveredOrders > 0,
    };
    const record = await this.prisma.shop_reviews.upsert({
      where: key,
      create: { userId, shopId, ...fields },
      update: fields,
      include: withAuthor,
    });

    const stats = await this.prisma.shop_reviews.aggregate({
      where: { shopId },
      _avg: { rating: true },
    });
    await this.prisma.shops.update({
      where: { id: shopId },
      data: { ratings: roundRating(stats._avg.rating ?? 0) },
    });

    return {
      review: toReview(record, record.reviews),
      updated: existing !== null,
    };
  }
}
