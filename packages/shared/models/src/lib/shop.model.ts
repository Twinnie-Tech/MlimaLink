import type { OpeningDay } from './opening-hours.model.js';
import type { Product } from './product.model.js';

/** A shop as it appears in the shop directory. */
export interface ShopSummary {
  id: string;
  name: string;
  bio?: string;
  category: string;
  address: string;
  /** Town riders collect orders from, one of DELIVERY_ZONES. */
  deliveryZone?: string;
  avatarUrl?: string;
  /** Wide header image for the shop page. */
  coverBanner?: string;
  /** Average review rating, 0 until the first review. */
  rating: number;
  reviewCount: number;
  productCount: number;
  /** Open days only; empty when the seller hasn't set hours. */
  openingHours: OpeningDay[];
  /** ISO date string. */
  createdAt: string;
}

export interface SocialLink {
  /** e.g. "facebook", "instagram", "x", "tiktok", "youtube", "whatsapp" */
  platform: string;
  url: string;
}

/** Everything on a shop's public page. */
export interface ShopDetail extends ShopSummary {
  website?: string;
  socialLinks: SocialLink[];
  /** USD charged per order for delivery. */
  deliveryFee: number;
  /** The shop also has a service provider profile at /providers/:id. */
  isProvider: boolean;
  /** Newest first; may be fewer than `productCount` for very large shops. */
  products: Product[];
}

export interface ShopFilter {
  /** Matches the shop's name, description or address. */
  search?: string;
  category?: string;
  /** One of DELIVERY_ZONES. */
  zone?: string;
}
