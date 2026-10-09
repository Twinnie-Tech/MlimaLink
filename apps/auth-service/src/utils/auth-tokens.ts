import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import { unauthorized } from '@org/errors';
import { authCookieOptions, setCookie } from './setCookie';

export const ACCESS_TOKEN_COOKIE = 'accessToken';
export const REFRESH_TOKEN_COOKIE = 'refreshToken';
export const SELLER_ACCESS_TOKEN_COOKIE = 'sellerAccessToken';
export const SELLER_REFRESH_TOKEN_COOKIE = 'sellerRefreshToken';
export const RIDER_ACCESS_TOKEN_COOKIE = 'riderAccessToken';
export const RIDER_REFRESH_TOKEN_COOKIE = 'riderRefreshToken';
export const ADMIN_ACCESS_TOKEN_COOKIE = 'adminAccessToken';
export const ADMIN_REFRESH_TOKEN_COOKIE = 'adminRefreshToken';

/** Shoppers, sellers, delivery riders and admins are separate accounts with separate cookies. */
export type AuthAccount = 'user' | 'seller' | 'rider' | 'admin';

export const AUTH_ACCOUNTS: readonly AuthAccount[] = [
  'user',
  'seller',
  'rider',
  'admin',
];

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
  rider: {
    access: RIDER_ACCESS_TOKEN_COOKIE,
    refresh: RIDER_REFRESH_TOKEN_COOKIE,
  },
  admin: {
    access: ADMIN_ACCESS_TOKEN_COOKIE,
    refresh: ADMIN_REFRESH_TOKEN_COOKIE,
  },
};

const MINUTE = 60;
const DAY = 24 * 60 * MINUTE;

/** Every token names this issuer; tokens from anywhere else are rejected. */
export const TOKEN_ISSUER = 'mlimalink-auth';

type TokenPolicy = {
  /** Env vars holding this account's signing secrets. */
  secretEnv: { access: string; refresh: string };
  accessTtlSeconds: number;
  /**
   * Idle timeout: each refresh issues a new refresh token with a fresh lifetime,
   * so an active session continues and an unused one ends after this long.
   */
  refreshTtlSeconds: number;
  /** Roles this account may hold. Anything else is refused even with a valid token. */
  roles: readonly string[];
};

/**
 * Shoppers, sellers, riders and admins are separate accounts: separate secrets, cookies
 * and audiences, so a token issued for one can never be used as another.
 * Sellers control shops and payouts, so their sessions end sooner when idle;
 * admins control every account, so theirs end sooner still.
 */
export const TOKEN_POLICIES: Record<AuthAccount, TokenPolicy> = {
  user: {
    secretEnv: {
      access: 'ACCESS_TOKEN_SECRET',
      refresh: 'REFRESH_TOKEN_SECRET',
    },
    accessTtlSeconds: 15 * MINUTE,
    refreshTtlSeconds: 7 * DAY,
    roles: ['user'],
  },
  seller: {
    secretEnv: {
      access: 'SELLER_ACCESS_TOKEN_SECRET',
      refresh: 'SELLER_REFRESH_TOKEN_SECRET',
    },
    accessTtlSeconds: 15 * MINUTE,
    refreshTtlSeconds: 1 * DAY,
    roles: ['seller'],
  },
  rider: {
    secretEnv: {
      access: 'RIDER_ACCESS_TOKEN_SECRET',
      refresh: 'RIDER_REFRESH_TOKEN_SECRET',
    },
    accessTtlSeconds: 15 * MINUTE,
    refreshTtlSeconds: 7 * DAY,
    roles: ['rider'],
  },
  admin: {
    secretEnv: {
      access: 'ADMIN_ACCESS_TOKEN_SECRET',
      refresh: 'ADMIN_REFRESH_TOKEN_SECRET',
    },
    accessTtlSeconds: 10 * MINUTE,
    refreshTtlSeconds: 8 * 60 * MINUTE,
    roles: ['admin'],
  },
};

export function isRoleAllowed(account: AuthAccount, role: string): boolean {
  return TOKEN_POLICIES[account].roles.includes(role);
}

export type AuthTokenPayload = {
  userId: string;
  role: string;
  /** Carried in the refresh token so refreshed cookies keep the same lifetime. */
  rememberMe?: boolean;
  /** Refresh token only: id of its session in Redis, removed on logout or password reset. */
  jti?: string;
  /** Refresh token only: id shared by a login's session and every session rotated from it. */
  fam?: string;
};

/** Public user fields returned to clients (never the password hash). */
export const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

/** The account's signing secrets. Throws when they are missing or shared with another account. */
export function getTokenSecrets(account: AuthAccount) {
  const { secretEnv } = TOKEN_POLICIES[account];
  const accessSecret = process.env[secretEnv.access];
  const refreshSecret = process.env[secretEnv.refresh];

  if (!accessSecret || !refreshSecret) {
    throw new Error(
      `${secretEnv.access} and ${secretEnv.refresh} must be set in .env`,
    );
  }

  if (accessSecret === refreshSecret) {
    throw new Error(
      `${secretEnv.access} and ${secretEnv.refresh} must be different`,
    );
  }

  const otherSecrets = AUTH_ACCOUNTS.filter((other) => other !== account)
    .map((other) => TOKEN_POLICIES[other].secretEnv)
    .flatMap((env) => [process.env[env.access], process.env[env.refresh]]);
  if (
    otherSecrets.includes(accessSecret) ||
    otherSecrets.includes(refreshSecret)
  ) {
    throw new Error(
      'Shopper, seller, rider and admin token secrets must all be different',
    );
  }

  return { accessSecret, refreshSecret };
}

export function signAccessToken(
  payload: AuthTokenPayload,
  account: AuthAccount,
): string {
  const { accessSecret } = getTokenSecrets(account);
  return jwt.sign(
    { userId: payload.userId, role: payload.role },
    accessSecret,
    {
      expiresIn: TOKEN_POLICIES[account].accessTtlSeconds,
      audience: account,
      issuer: TOKEN_ISSUER,
    },
  );
}

export function signRefreshToken(
  payload: AuthTokenPayload,
  sessionId: string,
  account: AuthAccount,
): string {
  const { refreshSecret } = getTokenSecrets(account);
  return jwt.sign(
    {
      userId: payload.userId,
      role: payload.role,
      rememberMe: payload.rememberMe ?? true,
      ...(payload.fam && { fam: payload.fam }),
    },
    refreshSecret,
    {
      expiresIn: TOKEN_POLICIES[account].refreshTtlSeconds,
      jwtid: sessionId,
      audience: account,
      issuer: TOKEN_ISSUER,
    },
  );
}

/**
 * Verifies a token for one account and returns its payload, or throws a 401.
 * Tokens signed for the other account, by another issuer, or carrying a role
 * that account may not hold are all rejected.
 */
export function verifyToken(
  token: string | undefined,
  kind: 'access' | 'refresh',
  account: AuthAccount,
): AuthTokenPayload {
  if (!token) {
    throw unauthorized('Unauthorized! Please log in.');
  }

  const { accessSecret, refreshSecret } = getTokenSecrets(account);
  try {
    const payload = jwt.verify(
      token,
      kind === 'access' ? accessSecret : refreshSecret,
      { audience: account, issuer: TOKEN_ISSUER },
    );
    if (
      typeof payload === 'string' ||
      typeof payload.userId !== 'string' ||
      typeof payload.role !== 'string' ||
      !isRoleAllowed(account, payload.role)
    ) {
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

function cookieOptionsFor(account: AuthAccount, rememberMe: boolean) {
  // Without maxAge the browser drops the cookie when it closes.
  return {
    ...authCookieOptions,
    maxAge: rememberMe
      ? TOKEN_POLICIES[account].refreshTtlSeconds * 1000
      : undefined,
  };
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
  rememberMe: boolean,
  account: AuthAccount = 'user',
): void {
  const names = AUTH_COOKIE_NAMES[account];
  const options = cookieOptionsFor(account, rememberMe);
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
