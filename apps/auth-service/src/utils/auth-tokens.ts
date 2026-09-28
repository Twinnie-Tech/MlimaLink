import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import { unauthorized } from '@org/errors';
import { authCookieOptions, setCookie } from './setCookie';

export const ACCESS_TOKEN_COOKIE = 'accessToken';
export const REFRESH_TOKEN_COOKIE = 'refreshToken';
export const SELLER_ACCESS_TOKEN_COOKIE = 'sellerAccessToken';
export const SELLER_REFRESH_TOKEN_COOKIE = 'sellerRefreshToken';

/** Shoppers and sellers are separate accounts with separate cookies. */
export type AuthAccount = 'user' | 'seller';

/**
 * Cookies are shared by every port on a host, so user-ui and seller-ui on the same
 * machine need different names to stay signed in side by side.
 */
export const AUTH_COOKIE_NAMES: Record<
  AuthAccount,
  { access: string; refresh: string }
> = {
  user: { access: ACCESS_TOKEN_COOKIE, refresh: REFRESH_TOKEN_COOKIE },
  seller: {
    access: SELLER_ACCESS_TOKEN_COOKIE,
    refresh: SELLER_REFRESH_TOKEN_COOKIE,
  },
};

export type AuthTokenPayload = {
  userId: string;
  role: string;
  /** Carried in the refresh token so refreshed cookies keep the same lifetime. */
  rememberMe?: boolean;
  /** Refresh token only: id of its session in Redis, removed on logout or password reset. */
  jti?: string;
};

/** Public user fields returned to clients (never the password hash). */
export const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

export function getTokenSecrets() {
  const accessSecret = process.env.ACCESS_TOKEN_SECRET;
  const refreshSecret = process.env.REFRESH_TOKEN_SECRET;

  if (!accessSecret || !refreshSecret) {
    throw new Error(
      'ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must be set in .env',
    );
  }

  return { accessSecret, refreshSecret };
}

export function signAccessToken(payload: AuthTokenPayload): string {
  const { accessSecret } = getTokenSecrets();
  return jwt.sign(
    { userId: payload.userId, role: payload.role },
    accessSecret,
    { expiresIn: '15m' },
  );
}

export function signRefreshToken(
  payload: AuthTokenPayload,
  sessionId: string,
): string {
  const { refreshSecret } = getTokenSecrets();
  return jwt.sign(
    {
      userId: payload.userId,
      role: payload.role,
      rememberMe: payload.rememberMe ?? true,
    },
    refreshSecret,
    { expiresIn: '7d', jwtid: sessionId },
  );
}

/** Verifies a token and returns its payload, or throws a 401. */
export function verifyToken(
  token: string | undefined,
  kind: 'access' | 'refresh',
): AuthTokenPayload {
  if (!token) {
    throw unauthorized('Unauthorized! Please log in.');
  }

  const { accessSecret, refreshSecret } = getTokenSecrets();
  try {
    const payload = jwt.verify(
      token,
      kind === 'access' ? accessSecret : refreshSecret,
    );
    if (typeof payload === 'string' || typeof payload.userId !== 'string') {
      throw new Error('Malformed token');
    }
    return payload as AuthTokenPayload;
  } catch {
    throw unauthorized(
      kind === 'access'
        ? 'Unauthorized! Token expired or invalid.'
        : 'Session expired! Please log in again.',
    );
  }
}

function cookieOptionsFor(rememberMe: boolean) {
  // Without maxAge the browser drops the cookie when it closes.
  return rememberMe
    ? authCookieOptions
    : { ...authCookieOptions, maxAge: undefined };
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
  rememberMe: boolean,
  account: AuthAccount = 'user',
): void {
  const names = AUTH_COOKIE_NAMES[account];
  const options = cookieOptionsFor(rememberMe);
  setCookie(res, names.refresh, tokens.refreshToken, options);
  setCookie(res, names.access, tokens.accessToken, options);
}

export function clearAuthCookies(
  res: Response,
  account: AuthAccount = 'user',
): void {
  // clearCookie only matches when path/secure/sameSite equal the ones used to set it.
  const { httpOnly, secure, sameSite } = authCookieOptions;
  const options = { httpOnly, secure, sameSite };
  const names = AUTH_COOKIE_NAMES[account];
  res.clearCookie(names.access, options);
  res.clearCookie(names.refresh, options);
}

/** Reads a token from its cookie, falling back to an `Authorization: Bearer` header. */
export function readToken(
  req: {
    cookies?: Record<string, string>;
    headers: { authorization?: string };
  },
  cookieName: string,
): string | undefined {
  const fromCookie = req.cookies?.[cookieName];
  if (fromCookie) return fromCookie;

  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}
