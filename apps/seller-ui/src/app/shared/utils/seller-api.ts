/** Client for the seller endpoints of the auth-service, reached through the API gateway at /api/auth. */

export type Shop = {
  id: string;
  name: string;
  bio: string | null;
  category: string;
  address: string;
  opening_hours: string | null;
  website: string | null;
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
  opening_hours?: string;
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

async function requestAuth<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/auth/${path}`, {
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

const isUnauthorized = (error: unknown) =>
  error instanceof AuthRequestError && error.status === 401;

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
    await requestAuth('POST', 'refresh-token/seller');
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
