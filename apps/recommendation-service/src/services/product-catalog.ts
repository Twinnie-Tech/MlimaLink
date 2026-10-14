import type { Prisma } from '@prisma/client';
import type { PaymentOption, Product } from '@org/models';
import { prisma } from '../prisma';

/** Matches the api's cap on listed products read per request. */
export const MAX_CATALOGUE_PRODUCTS = 500;

const cardFields = {
  id: true,
  title: true,
  shortDescription: true,
  price: true,
  salePrice: true,
  category: true,
  subCategory: true,
  images: true,
  tags: true,
  specs: true,
  options: true,
  variants: true,
  stock: true,
  ratings: true,
  reviewCount: true,
  shopId: true,
  paymentOptions: true,
} satisfies Prisma.productsSelect;

type CardRecord = Prisma.productsGetPayload<{ select: typeof cardFields }>;

/**
 * A listing as a product card shows it, matching the api's product JSON. The full
 * description stays on the product page, so the short one stands in for it.
 */
export function toCardProduct(record: CardRecord, shopName?: string): Product {
  const images = record.images.map((source, index) =>
    source.startsWith('data:')
      ? `/api/products/${record.id}/images/${index}`
      : source,
  );
  return {
    id: record.id,
    name: record.title,
    shortDescription: record.shortDescription,
    description: record.shortDescription,
    price: record.price,
    ...(record.salePrice != null && { salePrice: record.salePrice }),
    category: record.category,
    subCategory: record.subCategory,
    imageUrl: images[0] ?? '',
    images,
    tags: record.tags,
    specs: record.specs.map(({ name, value }) => ({ name, value })),
    options: record.options.map((option) => ({
      name: option.name,
      values: option.values.map((value) => ({
        label: value.label,
        ...(value.swatch != null && { swatch: value.swatch }),
        ...(value.imageIndex != null && { imageIndex: value.imageIndex }),
      })),
    })),
    variants: record.variants.map((variant) => ({
      choices: variant.choices as Record<string, string>,
      stock: variant.stock,
      ...(variant.price != null && { price: variant.price }),
      ...(variant.sku != null && { sku: variant.sku }),
    })),
    stock: record.stock,
    inStock: record.stock > 0,
    rating: record.ratings,
    reviewCount: record.reviewCount,
    shopId: record.shopId,
    ...(shopName && { shopName }),
    ...(record.paymentOptions.length > 0 && {
      paymentOptions: record.paymentOptions as PaymentOption[],
    }),
  };
}

/**
 * Listed products, newest first. Shop names are looked up separately so a shop with
 * missing data can't stop the whole catalogue from loading.
 */
export async function getListedProducts(): Promise<Product[]> {
  const records = await prisma.products.findMany({
    orderBy: { createdAt: 'desc' },
    take: MAX_CATALOGUE_PRODUCTS,
    select: cardFields,
  });
  const shops = await prisma.shops.findMany({
    where: { id: { in: [...new Set(records.map((record) => record.shopId))] } },
    select: { id: true, name: true },
  });
  const shopNames = new Map(shops.map((shop) => [shop.id, shop.name]));
  return records.map((record) =>
    toCardProduct(record, shopNames.get(record.shopId)),
  );
}
