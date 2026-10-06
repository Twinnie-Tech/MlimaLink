/** One choice a shopper can make, e.g. "Black" or "42". */
export interface ProductOptionValue {
  label: string;
  /** Hex colour shown as a swatch, e.g. "#111111". Colour options only. */
  swatch?: string;
  /** Index into `Product.images` of the photo showing this value. */
  imageIndex?: number;
}

/** Something the shopper picks before buying, e.g. Colour or Size. */
export interface ProductOption {
  name: string;
  values: ProductOptionValue[];
}

/** A fact about the product that shoppers read but don't pick, e.g. Brand. */
export interface ProductSpec {
  name: string;
  value: string;
}

/** One combination of option values, e.g. { Colour: "Black", Size: "42" }, with its own stock. */
export interface ProductVariant {
  sku?: string;
  /** Option name → chosen value label. Has exactly one entry per product option. */
  choices: Record<string, string>;
  /** Overrides the product's price for this combination. */
  price?: number;
  stock: number;
}

/** How a shopper may pay: everything now, half now and half on delivery, or everything on delivery. */
export type PaymentOption = 'full_upfront' | 'deposit' | 'cash_on_delivery';

/** How shoppers reach the seller about listings such as houses and cars. */
export interface SellerContact {
  /** International format, e.g. "+254712345678". */
  phone?: string;
  email?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
  inStock: boolean;
  rating: number;
  reviewCount: number;
  shortDescription?: string;
  /** Lower price shown instead of `price` while set. */
  salePrice?: number;
  subCategory?: string;
  /** Every photo, cover first. `imageUrl` is the cover. */
  images?: string[];
  tags?: string[];
  specs?: ProductSpec[];
  options?: ProductOption[];
  /** One per combination of option values; empty when the product has no options. */
  variants?: ProductVariant[];
  /** Total units available across all variants. */
  stock?: number;
  shopId?: string;
  shopName?: string;
  /** Only set for listings where shoppers contact the seller (see `listingTerms`). */
  contact?: SellerContact;
  /** What the seller accepts; see `paymentOptionsOf` for the default when missing. */
  paymentOptions?: PaymentOption[];
}

/** A product photo stored on ImageKit. `fileId` is needed to delete it. */
export interface UploadedImage {
  fileId: string;
  url: string;
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** How a product list is ordered. `newest` keeps listings newest first. */
export type ProductSort =
  'newest' | 'price_asc' | 'price_desc' | 'rating' | 'discount';

export interface ProductFilter {
  category?: string;
  subCategory?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  searchTerm?: string;
  /** Matches products offered in any of these colours, ignoring case. */
  colors?: string[];
  /** Matches products offered in any of these sizes, ignoring case. */
  sizes?: string[];
  /** Lowest average rating, 1 to 5. */
  minRating?: number;
  /** Only products whose sale price is below the regular price. */
  onSale?: boolean;
  sort?: ProductSort;
}

/** What shoppers can filter a product list by, from the products in a category. */
export interface ProductFacets {
  categories: string[];
  /** Sub-categories of the chosen category; empty when no category is chosen. */
  subCategories: string[];
  colors: { label: string; swatch?: string }[];
  sizes: string[];
  /** Cheapest and dearest unit price; both 0 when nothing matches. */
  minPrice: number;
  maxPrice: number;
}
