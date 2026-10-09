import type { PaginatedResponse } from './product.model.js';
import type { OrderStatus } from './delivery.model.js';

/** Someone who runs MlimaLink. */
export interface Admin {
  id: string;
  name: string;
  email: string;
  lastLoginAt: string | null;
  createdAt: string;
}

/** One month of platform activity, oldest first in `AdminOverview.monthly`. */
export interface MonthlyPerformance {
  /** "YYYY-MM" in UTC. */
  month: string;
  /** Short month name, e.g. "May". */
  label: string;
  /** Goods sold (subtotal − discount) on orders that weren't cancelled. */
  sales: number;
  platformFees: number;
  sellerEarnings: number;
  orders: number;
  newUsers: number;
  newSellers: number;
}

export interface ChartSlice {
  label: string;
  value: number;
}

/** An order as the admin sees it, with how its money is split. */
export interface AdminOrder {
  id: string;
  number: string;
  shopId: string;
  shopName: string;
  buyerName: string;
  buyerEmail: string;
  status: OrderStatus;
  itemCount: number;
  /** subtotal − discount: what the fee is taken from. */
  goods: number;
  deliveryFee: number;
  total: number;
  platformFee: number;
  sellerEarnings: number;
  createdAt: string;
}

export interface TopShop {
  shopId: string;
  shopName: string;
  orders: number;
  sales: number;
  platformFees: number;
}

export interface AdminOverview {
  totals: {
    /** Goods sold on orders that weren't cancelled. */
    sales: number;
    platformFees: number;
    sellerEarnings: number;
    deliveryFees: number;
    orders: number;
    users: number;
    sellers: number;
    shops: number;
    products: number;
    riders: number;
  };
  /** The last six months, oldest first, including the current one. */
  monthly: MonthlyPerformance[];
  /** Shoppers, sellers and riders. */
  accounts: ChartSlice[];
  /** Shoppers by last known device. */
  devices: ChartSlice[];
  /**
   * Shoppers and sellers per ISO country code, most first. A shopper counts
   * under their profile country, else where their orders were delivered, else
   * where they last browsed from, else Kenya, so every shopper is counted.
   */
  countries: { country: string; users: number; sellers: number }[];
  orderStatus: ChartSlice[];
  recentOrders: AdminOrder[];
  topShops: TopShop[];
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  country: string | null;
  suspended: boolean;
  orders: number;
  /** Order totals, excluding cancelled orders. */
  spent: number;
  createdAt: string;
}

export interface AdminSeller {
  id: string;
  name: string;
  email: string;
  /** The shop's logo; sellers have no photo of their own. */
  avatarUrl: string | null;
  phone: string;
  country: string;
  suspended: boolean;
  shop: { id: string; name: string } | null;
  payoutsConnected: boolean;
  orders: number;
  /** What the seller has earned on delivered orders. */
  earnings: number;
  /** MlimaLink's fees on the seller's delivered orders. */
  platformFees: number;
  createdAt: string;
}

/** A listing as the admin sees it. */
export interface AdminProduct {
  id: string;
  title: string;
  /** Cover photo, or null when there is none or it is stored inline. */
  imageUrl: string | null;
  price: number;
  salePrice: number | null;
  /** Percent off the price; 0 when not on sale. */
  discountPercent: number;
  stock: number;
  category: string;
  subCategory: string;
  rating: number;
  reviewCount: number;
  shopId: string;
  shopName: string;
  createdAt: string;
}

export interface AdminPayments extends PaginatedResponse<AdminOrder> {
  summary: {
    /** Settled: delivered orders. */
    platformFees: number;
    sellerEarnings: number;
    deliveryFees: number;
    /** Still to settle: orders placed, confirmed or on their way. */
    pendingPlatformFees: number;
    pendingSellerEarnings: number;
  };
}

export const ADMIN_PAGE_SIZE = 20;
export const ADMIN_MAX_PAGE_SIZE = 100;
export const OVERVIEW_MONTHS = 6;

const ORDER_STATUSES: readonly OrderStatus[] = [
  'placed',
  'confirmed',
  'out_for_delivery',
  'delivered',
  'cancelled',
];

export interface AdminListQuery {
  search?: string;
  page: number;
  pageSize: number;
  status?: OrderStatus;
  suspended?: boolean;
  /** Products only: just those with a sale price. */
  onSale?: boolean;
}

/** Reads `?search=&page=&pageSize=&status=&suspended=&onSale=`, ignoring values that don't make sense. */
export function parseAdminListQuery(
  query: Record<string, unknown>,
): AdminListQuery {
  const int = (value: unknown, fallback: number) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  };
  const search =
    typeof query['search'] === 'string' ? query['search'].trim() : '';
  const status = ORDER_STATUSES.find((s) => s === query['status']);
  const suspended =
    query['suspended'] === 'true'
      ? true
      : query['suspended'] === 'false'
        ? false
        : undefined;
  return {
    ...(search && { search: search.slice(0, 100) }),
    page: int(query['page'], 1),
    pageSize: Math.min(
      int(query['pageSize'], ADMIN_PAGE_SIZE),
      ADMIN_MAX_PAGE_SIZE,
    ),
    ...(status && { status }),
    ...(suspended !== undefined && { suspended }),
    ...(query['onSale'] === 'true' && { onSale: true }),
  };
}

export function parseSuspension(
  body: unknown,
): { suspended: boolean } | { error: string } {
  const value = (body as { suspended?: unknown } | null)?.suspended;
  return typeof value === 'boolean'
    ? { suspended: value }
    : { error: 'Send { "suspended": true } or { "suspended": false }.' };
}

/** Month keys ("YYYY-MM", UTC) for the last `count` months ending with `now`'s, oldest first. */
export function recentMonths(
  now: Date,
  count = OVERVIEW_MONTHS,
): { month: string; label: string; start: Date }[] {
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - i), 1),
    );
    return {
      month: monthKey(start),
      label: start.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      start,
    };
  });
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
