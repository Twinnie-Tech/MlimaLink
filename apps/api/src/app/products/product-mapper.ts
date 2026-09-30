import type { Prisma } from '@prisma/client';
import type { PaymentOption, Product, ProductFilter } from '@org/models';
import { descriptionText, listingTerms, priceRange } from '@org/models/catalog';
import { sanitizeDescription } from './rich-text';

export const productWithShop = {
  shop: {
    select: {
      name: true,
      seller: { select: { phone_number: true, email: true } },
    },
  },
} satisfies Prisma.productsInclude;

export type ProductRecord = Prisma.productsGetPayload<{
  include: typeof productWithShop;
}>;

const OBJECT_ID = /^[a-f\d]{24}$/i;

export const isObjectId = (id: string) => OBJECT_ID.test(id);

/** Uploaded photos are served from their own URL so product JSON stays small and cacheable. */
export const productImageUrl = (productId: string, index: number) =>
  `/api/products/${productId}/images/${index}`;

/** A stored product as the shop sees it. Prisma's nulls become missing fields. */
export function toProduct(record: ProductRecord): Product {
  const images = record.images.map((source, index) =>
    source.startsWith('data:') ? productImageUrl(record.id, index) : source,
  );
  const seller = record.shop?.seller;
  // The seller's phone and email are only public on listings shoppers enquire about.
  const contact =
    seller && listingTerms(record).contactSeller
      ? { phone: seller.phone_number, email: seller.email }
      : undefined;
  return {
    id: record.id,
    name: record.title,
    shortDescription: record.shortDescription,
    description: sanitizeDescription(record.description),
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
        ...(value.imageIndex != null && {
          imageIndex: value.imageIndex,
        }),
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
    shopName: record.shop?.name,
    ...(contact && { contact }),
    ...(record.paymentOptions.length > 0 && {
      paymentOptions: record.paymentOptions as PaymentOption[],
    }),
  };
}

/** The same filters the sample catalogue applies, plus sub-category, tags and details in search. */
export function matchesFilter(product: Product, filter?: ProductFilter) {
  if (!filter) return true;
  if (filter.category && product.category !== filter.category) return false;
  const { min, max } = priceRange(product);
  if (filter.minPrice !== undefined && max < filter.minPrice) return false;
  if (filter.maxPrice !== undefined && min > filter.maxPrice) return false;
  if (filter.inStock !== undefined && product.inStock !== filter.inStock) {
    return false;
  }
  if (filter.searchTerm) {
    const term = filter.searchTerm.toLowerCase();
    const haystack = [
      product.name,
      descriptionText(product.description),
      product.category,
      product.subCategory,
      ...(product.tags ?? []),
      ...(product.specs ?? []).map((spec) => spec.value),
    ];
    if (!haystack.some((text) => text?.toLowerCase().includes(term))) {
      return false;
    }
  }
  return true;
}
