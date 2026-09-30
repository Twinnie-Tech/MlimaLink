/** Client for the seller endpoints of the auth-service, reached through the API gateway at /api/auth. */

import type { OpeningDay } from '@org/models/opening-hours';

export type Shop = {
  id: string;
  name: string;
  bio: string | null;
  category: string;
  address: string;
  /** Open days only; empty when the seller hasn't set hours. */
  opening_hours: OpeningDay[];
  website: string | null;
  /** Header image URL for the shop page. */
  coverBanner: string | null;
  socialLinks: { platform: string; url: string }[];
  /** Average review rating, 0 until the first review. */
  ratings: number;
  /** ISO date string. */
  createdAt: string;
};

export type Seller = {
  id: string;
  name: string;
  email: string;
  phone_number: string;
  /** ISO 3166-1 alpha-2 code, e.g. "KE". */
  country: string;
  stripeId: string | null;
  /** ISO date string. */
  createdAt: string;
  shop: Shop | null;
};

export type SellerAccountData = {
  name: string;
  email: string;
  /** International format, e.g. +254712345678. */
  phone_number: string;
  country: string;
  password: string;
};

export type ShopData = {
  name: string;
  category: string;
  address: string;
  bio?: string;
  opening_hours?: OpeningDay[];
  website?: string;
};

type MessageResponse = { success: true; message: string };

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Mirrors the auth-service rule: 8+ chars with upper, lower, digit and special character. */
export const PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export class AuthRequestError extends Error {
  /** HTTP status, or 0 when the server could not be reached. */
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AuthRequestError';
  }
}

/** Sends a JSON request with the seller's cookies and throws AuthRequestError on failure. */
export async function requestJson<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers:
        body === undefined ? undefined : { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AuthRequestError(
      'Could not reach the server. Check your connection and try again.',
      0,
    );
  }

  const data = (await response.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
    message?: string;
  } | null;

  if (!response.ok || data?.success === false) {
    throw new AuthRequestError(
      data?.error ??
        data?.message ??
        (response.status >= 500
          ? 'The server is unavailable right now. Please try again later.'
          : 'Something went wrong. Please try again.'),
      response.status,
    );
  }

  return data as T;
}

function requestAuth<T>(method: 'GET' | 'POST', path: string, body?: unknown) {
  return requestJson<T>(method, `/api/auth/${path}`, body);
}

export const isUnauthorized = (error: unknown) =>
  error instanceof AuthRequestError && error.status === 401;

/** Renews an expired seller access token with the refresh token cookie. */
export function refreshSellerSession() {
  return requestAuth<MessageResponse>('POST', 'refresh-token/seller');
}

/** Retries once after renewing an expired seller session. */
export async function withSession<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
  }
  await refreshSellerSession();
  return request();
}

/**
 * Returns the signed-in seller, or null when no seller is signed in.
 * An expired access token is renewed once with the seller refresh token cookie.
 */
export async function getLoggedInSeller(): Promise<Seller | null> {
  const fetchSeller = async () =>
    (await requestAuth<{ seller: Seller }>('GET', 'logged-in-seller')).seller;

  try {
    return await fetchSeller();
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
  }

  try {
    await refreshSellerSession();
  } catch (error) {
    if (isUnauthorized(error)) return null;
    throw error;
  }

  return fetchSeller();
}

export function registerSeller(body: SellerAccountData) {
  return requestAuth<MessageResponse>('POST', 'register/seller', body);
}

export function verifySeller(body: SellerAccountData & { otp: string }) {
  return requestAuth<MessageResponse & { seller: Seller }>(
    'POST',
    'verify/seller',
    body,
  );
}

export function loginSeller(body: {
  email: string;
  password: string;
  rememberMe: boolean;
}) {
  return requestAuth<MessageResponse & { seller: Seller }>(
    'POST',
    'login/seller',
    body,
  );
}

/** Emails a reset link for the seller account; the reply is the same whether or not it exists. */
export function forgotSellerPassword(body: { email: string }) {
  return requestAuth<MessageResponse>('POST', 'forgot-password/seller', body);
}

export function logoutSeller() {
  return requestAuth<MessageResponse>('POST', 'logout/seller');
}

export function createShop(body: ShopData) {
  return requestAuth<MessageResponse & { shop: Shop }>(
    'POST',
    'create-shop',
    body,
  );
}

export function createStripeLink() {
  return requestAuth<{ success: true; url: string }>(
    'POST',
    'create-stripe-link',
  );
}
