import type { Prisma } from '@prisma/client';
import type {
  PaymentOption,
  Product,
  ProductFacets,
  ProductFilter,
  ProductSort,
} from '@org/models';
import {
  compareSizes,
  descriptionText,
  discountPercent,
  listingTerms,
  priceRange,
  productColours,
  productSizes,
} from '@org/models/catalog';
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

const includesAny = (values: string[], wanted: string[]) => {
  const lower = new Set(values.map((value) => value.toLowerCase()));
  return wanted.some((value) => lower.has(value.toLowerCase()));
};

/** Category, price, stock, colour, size, rating, sale and search filters. Search covers tags and details too. */
export function matchesFilter(product: Product, filter?: ProductFilter) {
  if (!filter) return true;
  if (filter.category && product.category !== filter.category) return false;
  if (filter.subCategory && product.subCategory !== filter.subCategory) {
    return false;
  }
  const { min, max } = priceRange(product);
  if (filter.minPrice !== undefined && max < filter.minPrice) return false;
  if (filter.maxPrice !== undefined && min > filter.maxPrice) return false;
  if (filter.inStock !== undefined && product.inStock !== filter.inStock) {
    return false;
  }
  if (filter.onSale && discountPercent(product) === 0) return false;
  if (filter.minRating !== undefined && product.rating < filter.minRating) {
    return false;
  }
  if (
    filter.colors?.length &&
    !includesAny(
      productColours(product).map((value) => value.label),
      filter.colors,
    )
  ) {
    return false;
  }
  if (
    filter.sizes?.length &&
    !includesAny(productSizes(product), filter.sizes)
  ) {
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

const SORTERS: Record<ProductSort, (a: Product, b: Product) => number> = {
  newest: () => 0,
  price_asc: (a, b) => priceRange(a).min - priceRange(b).min,
  price_desc: (a, b) => priceRange(b).min - priceRange(a).min,
  rating: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
  discount: (a, b) => discountPercent(b) - discountPercent(a),
};

/** A sorted copy. Ties keep their order, so `newest` leaves the list as it is. */
export function sortProducts(
  products: Product[],
  sort: ProductSort = 'newest',
) {
  return [...products].sort(SORTERS[sort]);
}

const MAX_FACET_COLOURS = 24;
const MAX_FACET_SIZES = 30;

/** The colours, sizes, sub-categories and price span of some products, most common colours first. */
export function productFacets(
  products: Product[],
  categories: string[],
  category?: string,
): ProductFacets {
  const colours = new Map<
    string,
    { label: string; swatch?: string; count: number }
  >();
  const sizes = new Map<string, string>();
  const subCategories = new Set<string>();
  let minPrice = Infinity;
  let maxPrice = -Infinity;

  for (const product of products) {
    for (const { label, swatch } of productColours(product)) {
      const key = label.toLowerCase();
      const seen = colours.get(key);
      if (seen) {
        seen.count += 1;
        seen.swatch ??= swatch;
      } else {
        colours.set(key, { label, ...(swatch && { swatch }), count: 1 });
      }
    }
    for (const size of productSizes(product)) {
      if (!sizes.has(size.toLowerCase())) sizes.set(size.toLowerCase(), size);
    }
    if (category && product.subCategory) subCategories.add(product.subCategory);
    const { min, max } = priceRange(product);
    minPrice = Math.min(minPrice, min);
    maxPrice = Math.max(maxPrice, max);
  }

  return {
    categories,
    subCategories: [...subCategories].sort(),
    colors: [...colours.values()]
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, MAX_FACET_COLOURS)
      .map(({ label, swatch }) => ({ label, ...(swatch && { swatch }) })),
    sizes: [...sizes.values()].sort(compareSizes).slice(0, MAX_FACET_SIZES),
    minPrice: products.length ? Math.floor(minPrice) : 0,
    maxPrice: products.length ? Math.ceil(maxPrice) : 0,
  };
}
