import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import { unauthorized } from '@org/errors';
import { authCookieOptions, setCookie } from './setCookie';

export const ACCESS_TOKEN_COOKIE = 'accessToken';
export const REFRESH_TOKEN_COOKIE = 'refreshToken';

export type AuthTokenPayload = {
  userId: string;
  role: string;
  /** Carried in the refresh token so refreshed cookies keep the same lifetime. */
  rememberMe?: boolean;
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

export function signRefreshToken(payload: AuthTokenPayload): string {
  const { refreshSecret } = getTokenSecrets();
  return jwt.sign(
    {
      userId: payload.userId,
      role: payload.role,
      rememberMe: payload.rememberMe ?? true,
    },
    refreshSecret,
    { expiresIn: '7d' },
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

export function setAccessTokenCookie(
  res: Response,
  token: string,
  rememberMe: boolean,
): void {
  setCookie(res, ACCESS_TOKEN_COOKIE, token, cookieOptionsFor(rememberMe));
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
  rememberMe: boolean,
): void {
  setCookie(
    res,
    REFRESH_TOKEN_COOKIE,
    tokens.refreshToken,
    cookieOptionsFor(rememberMe),
  );
  setAccessTokenCookie(res, tokens.accessToken, rememberMe);
}

export function clearAuthCookies(res: Response): void {
  // clearCookie only matches when path/secure/sameSite equal the ones used to set it.
  const { httpOnly, secure, sameSite } = authCookieOptions;
  const options = { httpOnly, secure, sameSite };
  res.clearCookie(ACCESS_TOKEN_COOKIE, options);
  res.clearCookie(REFRESH_TOKEN_COOKIE, options);
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
