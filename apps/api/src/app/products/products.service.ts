import { Injectable, Logger } from '@nestjs/common';
import { ProductsService as LibProductsService } from '@org/api-products';
import { notFound } from '@org/errors';
import type {
  PaginatedResponse,
  Product,
  ProductFilter,
  ProductInput,
} from '@org/models';
import { PrismaService } from '../prisma.service';
import {
  isObjectId,
  matchesFilter,
  productWithShop,
  toProduct,
} from './product-mapper';

/** Seller products are filtered in memory; this caps how many are read per request. */
const MAX_LISTED_PRODUCTS = 500;

@Injectable()
export class ProductsApiService {
  private readonly logger = new Logger(ProductsApiService.name);
  private readonly samples = new LibProductsService();

  constructor(private readonly prisma: PrismaService) {}

  /** Seller products, newest first, followed by the sample catalogue. */
  async getProducts(
    filter?: ProductFilter,
    page = 1,
    pageSize = 10,
  ): Promise<PaginatedResponse<Product>> {
    const listed = (await this.listedProducts(filter?.category)).filter(
      (product) => matchesFilter(product, filter),
    );
    const samples = this.samples.getProducts(
      filter,
      1,
      Number.MAX_SAFE_INTEGER,
    ).items;
    const all = [...listed, ...samples];
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
    return [
      ...new Set([
        ...listed.map((product) => product.category),
        ...this.samples.getCategories(),
      ]),
    ].sort();
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
    return { images: record.images, imageFileIds: record.imageFileIds ?? [] };
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
