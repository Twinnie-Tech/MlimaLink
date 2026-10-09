/**
 * Client for admin sign-in (auth-service, at /api/auth) and the admin endpoints of the
 * shop API (at /api/admin), both reached through the API gateway.
 */

import type {
  Admin,
  AdminOrder,
  AdminOverview,
  AdminPayments,
  AdminProduct,
  AdminSeller,
  AdminUser,
  ApiResponse,
  OrderStatus,
  PaginatedResponse,
} from '@org/models';

type MessageResponse = { success: true; message: string };

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

/** Sends a JSON request with the admin's cookies and throws AuthRequestError on failure. */
export async function requestJson<T>(
  method: 'GET' | 'POST' | 'PATCH',
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

/** Renews an expired admin access token with the refresh token cookie. */
export function refreshAdminSession() {
  return requestAuth<MessageResponse>('POST', 'refresh-token/admin');
}

/** Retries once after renewing an expired admin session. */
export async function withSession<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
  }
  await refreshAdminSession();
  return request();
}

/**
 * Returns the signed-in admin, or null when no admin is signed in.
 * An expired access token is renewed once with the admin refresh token cookie.
 */
export async function getLoggedInAdmin(): Promise<Admin | null> {
  const fetchAdmin = async () =>
    (await requestAuth<{ admin: Admin }>('GET', 'logged-in-admin')).admin;

  try {
    return await fetchAdmin();
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
  }

  try {
    await refreshAdminSession();
  } catch (error) {
    if (isUnauthorized(error)) return null;
    throw error;
  }

  return fetchAdmin();
}

export function loginAdmin(body: {
  email: string;
  password: string;
  rememberMe: boolean;
}) {
  return requestAuth<MessageResponse & { admin: Admin }>(
    'POST',
    'login/admin',
    body,
  );
}

export function logoutAdmin() {
  return requestAuth<MessageResponse>('POST', 'logout/admin');
}

export type ListParams = {
  search?: string;
  page?: number;
  status?: OrderStatus;
  suspended?: boolean;
  onSale?: boolean;
};

function withParams(path: string, params: ListParams = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.page && params.page > 1) query.set('page', String(params.page));
  if (params.status) query.set('status', params.status);
  if (params.suspended !== undefined) {
    query.set('suspended', String(params.suspended));
  }
  if (params.onSale) query.set('onSale', 'true');
  const text = query.toString();
  return `/api/admin/${path}${text ? `?${text}` : ''}`;
}

async function getData<T>(url: string): Promise<T> {
  const response = await withSession(() =>
    requestJson<ApiResponse<T>>('GET', url),
  );
  return response.data;
}

export const ADMIN_KEYS = {
  overview: ['admin', 'overview'] as const,
  users: (params: ListParams) => ['admin', 'users', params] as const,
  sellers: (params: ListParams) => ['admin', 'sellers', params] as const,
  orders: (params: ListParams) => ['admin', 'orders', params] as const,
  payments: (params: ListParams) => ['admin', 'payments', params] as const,
  products: (params: ListParams) => ['admin', 'products', params] as const,
  admins: (params: ListParams) => ['admin', 'admins', params] as const,
};

/** The shopper-facing store, where product and shop pages live. */
export const SHOP_URL = (
  process.env.NEXT_PUBLIC_SHOP_URL ?? 'http://localhost:4200'
).replace(/\/$/, '');

export const productUrl = (id: string) =>
  `${SHOP_URL}/products/${encodeURIComponent(id)}`;

export const shopUrl = (id: string) =>
  `${SHOP_URL}/shops/${encodeURIComponent(id)}`;

export const getOverview = () => getData<AdminOverview>('/api/admin/overview');

export const listUsers = (params: ListParams) =>
  getData<PaginatedResponse<AdminUser>>(withParams('users', params));

export const listSellers = (params: ListParams) =>
  getData<PaginatedResponse<AdminSeller>>(withParams('sellers', params));

export const listOrders = (params: ListParams) =>
  getData<PaginatedResponse<AdminOrder>>(withParams('orders', params));

export const getPayments = (params: ListParams) =>
  getData<AdminPayments>(withParams('payments', params));

export const listProducts = (params: ListParams) =>
  getData<PaginatedResponse<AdminProduct>>(withParams('products', params));

export const listAdmins = (params: ListParams) =>
  getData<PaginatedResponse<Admin>>(withParams('admins', params));

export function setSuspended(
  kind: 'users' | 'sellers',
  id: string,
  suspended: boolean,
) {
  return withSession(() =>
    requestJson<ApiResponse<AdminUser | AdminSeller>>(
      'PATCH',
      `/api/admin/${kind}/${encodeURIComponent(id)}`,
      { suspended },
    ),
  );
}
