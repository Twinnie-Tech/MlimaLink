import { Injectable, Logger } from '@nestjs/common';
import { ProductsService as LibProductsService } from '@org/api-products';
import { notFound } from '@org/errors';
import type {
  PaginatedResponse,
  Product,
  ProductFacets,
  ProductFilter,
  ProductInput,
} from '@org/models';
import { discountPercent } from '@org/models/catalog';
import { PrismaService } from '../prisma.service';
import {
  isObjectId,
  matchesFilter,
  productFacets,
  productWithShop,
  sortProducts,
  toProduct,
} from './product-mapper';

/** Seller products are filtered in memory; this caps how many are read per request. */
const MAX_LISTED_PRODUCTS = 500;
export const MAX_OFFERS = 12;

@Injectable()
export class ProductsApiService {
  private readonly logger = new Logger(ProductsApiService.name);
  private readonly samples = new LibProductsService();

  constructor(private readonly prisma: PrismaService) {}

  /** Seller products, newest first, followed by the sample catalogue, unless another sort is asked for. */
  async getProducts(
    filter?: ProductFilter,
    page = 1,
    pageSize = 10,
  ): Promise<PaginatedResponse<Product>> {
    const matching = [
      ...(await this.listedProducts(filter?.category)),
      ...this.sampleProducts(),
    ].filter((product) => matchesFilter(product, filter));
    const all = sortProducts(matching, filter?.sort);
    const start = (page - 1) * pageSize;
    return {
      items: all.slice(start, start + pageSize),
      total: all.length,
      page,
      pageSize,
      totalPages: Math.ceil(all.length / pageSize),
    };
  }

  async getProductById(id: string): Promise<Product | undefined> {
    if (!isObjectId(id)) return this.samples.getProductById(id);
    const record = await this.prisma.products.findUnique({
      where: { id },
      include: productWithShop,
    });
    return record ? toProduct(record) : undefined;
  }

  async getCategories(): Promise<string[]> {
    const listed = await this.listedProducts();
    return this.categoriesOf(listed);
  }

  /** In-stock products on sale, biggest discount first. */
  async getOffers(limit = MAX_OFFERS): Promise<Product[]> {
    const onSale = [
      ...(await this.listedProducts()),
      ...this.sampleProducts(),
    ].filter((product) => product.inStock && discountPercent(product) > 0);
    return sortProducts(onSale, 'discount').slice(0, limit);
  }

  /** What the products in a category (and search) can be filtered by. */
  async getFacets(
    filter: Pick<ProductFilter, 'category' | 'searchTerm'> = {},
  ): Promise<ProductFacets> {
    const listed = await this.listedProducts();
    const matching = [...listed, ...this.sampleProducts()].filter((product) =>
      matchesFilter(product, filter),
    );
    return productFacets(matching, this.categoriesOf(listed), filter.category);
  }

  /** The stored photo as bytes, or undefined when the product or photo doesn't exist. */
  async getProductImage(
    id: string,
    index: number,
  ): Promise<{ contentType: string; body: Buffer } | undefined> {
    if (!isObjectId(id)) return undefined;
    const record = await this.prisma.products.findUnique({
      where: { id },
      select: { images: true },
    });
    const image = record?.images[index];
    if (!image) return undefined;

    const match = /^data:(image\/[\w+.-]+);base64,(.*)$/s.exec(image);
    if (!match) return undefined;
    return { contentType: match[1], body: Buffer.from(match[2], 'base64') };
  }

  async listShopProducts(shopId: string): Promise<Product[]> {
    const records = await this.prisma.products.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      include: productWithShop,
    });
    return records.map(toProduct);
  }

  async createProduct(shopId: string, input: ProductInput): Promise<Product> {
    const record = await this.prisma.products.create({
      data: { ...input, shopId },
      include: productWithShop,
    });
    return toProduct(record);
  }

  /** Removes one of the shop's products and returns its photos, so they can be deleted too. */
  async deleteProduct(
    shopId: string,
    id: string,
  ): Promise<{ images: string[]; imageFileIds: string[] }> {
    const record = isObjectId(id)
      ? await this.prisma.products.findFirst({
          where: { id, shopId },
          select: { images: true, imageFileIds: true },
        })
      : null;
    const { count } = record
      ? await this.prisma.products.deleteMany({ where: { id, shopId } })
      : { count: 0 };
    if (!record || count === 0) {
      throw notFound('Product', { id });
    }
    await this.prisma.product_reviews.deleteMany({ where: { productId: id } });
    return { images: record.images, imageFileIds: record.imageFileIds ?? [] };
  }

  private sampleProducts(): Product[] {
    return this.samples.getProducts(undefined, 1, Number.MAX_SAFE_INTEGER)
      .items;
  }

  private categoriesOf(listed: Product[]): string[] {
    return [
      ...new Set([
        ...listed.map((product) => product.category),
        ...this.samples.getCategories(),
      ]),
    ].sort();
  }

  private async listedProducts(category?: string): Promise<Product[]> {
    try {
      const records = await this.prisma.products.findMany({
        where: category ? { category } : undefined,
        orderBy: { createdAt: 'desc' },
        take: MAX_LISTED_PRODUCTS,
        include: productWithShop,
      });
      return records.map(toProduct);
    } catch (error) {
      this.logger.warn(
        `Seller products unavailable, showing samples only: ${
          error instanceof Error ? error.message.split('\n')[0] : error
        }`,
      );
      return [];
    }
  }
}
