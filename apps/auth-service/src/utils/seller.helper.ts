import type { Prisma } from '@prisma/client';
import { validationError } from '@org/errors';
import { validateRegistrationData, type RegistrationData } from './auth.helper';

/** International format: "+" then country code and number, 8 to 15 digits in total. */
const phoneRegex = /^\+[1-9]\d{7,14}$/;
const countryCodeRegex = /^[A-Z]{2}$/;
const MAX_SHOP_NAME_LENGTH = 100;
const MAX_SHOP_BIO_LENGTH = 500;

/** Public seller fields returned to clients (never the password hash). */
export const safeSellerSelect = {
  id: true,
  name: true,
  email: true,
  phone_number: true,
  country: true,
  stripeId: true,
  createdAt: true,
  shop: true,
} satisfies Prisma.sellersSelect;

export type SafeSeller = Prisma.sellersGetPayload<{
  select: typeof safeSellerSelect;
}>;

export function validateSellerRegistration(data: RegistrationData): void {
  validateRegistrationData(data, 'seller');

  if (!phoneRegex.test(data.phone_number ?? '')) {
    throw validationError(
      'Enter a valid phone number with its country code, e.g. +254712345678!',
    );
  }

  if (!countryCodeRegex.test(data.country ?? '')) {
    throw validationError('Select a valid country!');
  }
}

export type ShopData = {
  name?: string;
  bio?: string;
  category?: string;
  address?: string;
  opening_hours?: string;
  website?: string;
};

/** Validates and trims shop details; optional fields come back undefined when blank. */
export function validateShopData(data: ShopData) {
  const name = data.name?.trim();
  const category = data.category?.trim();
  const address = data.address?.trim();
  const bio = data.bio?.trim() || undefined;
  const opening_hours = data.opening_hours?.trim() || undefined;
  const website = data.website?.trim() || undefined;

  if (!name || !category || !address) {
    throw validationError('Shop name, category and address are required!');
  }

  if (name.length > MAX_SHOP_NAME_LENGTH) {
    throw validationError(
      `Shop name must be at most ${MAX_SHOP_NAME_LENGTH} characters!`,
    );
  }

  if (bio && bio.length > MAX_SHOP_BIO_LENGTH) {
    throw validationError(
      `Shop bio must be at most ${MAX_SHOP_BIO_LENGTH} characters!`,
    );
  }

  if (website && !isHttpUrl(website)) {
    throw validationError(
      'Website must be a full link starting with http:// or https://!',
    );
  }

  return { name, category, address, bio, opening_hours, website };
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Base URL of the seller dashboard (seller-ui). */
export function sellerUiUrl(): string {
  return (process.env.SELLER_UI_URL ?? 'http://localhost:4300').replace(
    /\/+$/,
    '',
  );
}
