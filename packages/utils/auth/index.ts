import jwt from 'jsonwebtoken';

/** The signed-in accounts other services accept; riders aren't served outside the api yet. */
export const ACCOUNT_TYPES = ['user', 'seller', 'admin'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Set by auth-service; these must match its cookies, audiences, roles and issuer. */
export const ACCESS_TOKEN_COOKIES: Record<AccountType, string> = {
  user: 'accessToken',
  seller: 'sellerAccessToken',
  admin: 'adminAccessToken',
};

const SECRET_ENV: Record<AccountType, string> = {
  user: 'ACCESS_TOKEN_SECRET',
  seller: 'SELLER_ACCESS_TOKEN_SECRET',
  admin: 'ADMIN_ACCESS_TOKEN_SECRET',
};

const TOKEN_ISSUER = 'mlimalink-auth';

export interface VerifiedAccess {
  /** The user, seller or admin id. */
  id: string;
  /** When the token stops working, in milliseconds since the epoch. */
  expiresAt: number;
}

/** How long a socket ticket can be used to open a connection. */
export const SOCKET_TICKET_SECONDS = 60;

export function isAccountType(value: unknown): value is AccountType {
  return ACCOUNT_TYPES.includes(value as AccountType);
}

function secretFor(account: AccountType): string {
  const secret = process.env[SECRET_ENV[account]];
  if (!secret) {
    throw new Error(`${SECRET_ENV[account]} must be set in .env`);
  }
  return secret;
}

/**
 * A short-lived ticket for opening a WebSocket on another site, where the browser won't
 * send the UI's cookie. It only opens sockets (it isn't an access token), and the socket
 * still closes when the session it came from expires.
 */
export function issueSocketTicket(
  account: AccountType,
  access: VerifiedAccess,
): string {
  return jwt.sign(
    {
      userId: access.id,
      role: account,
      sessionExp: Math.floor(access.expiresAt / 1000),
    },
    secretFor(account),
    {
      audience: `${account}-socket`,
      issuer: TOKEN_ISSUER,
      expiresIn: SOCKET_TICKET_SECONDS,
    },
  );
}

/** The session behind a socket ticket, or null when it's missing, expired or forged. */
export function verifySocketTicket(
  ticket: string | undefined,
  account: AccountType,
): VerifiedAccess | null {
  const secret = secretFor(account);
  if (!ticket) return null;
  try {
    const payload = jwt.verify(ticket, secret, {
      audience: `${account}-socket`,
      issuer: TOKEN_ISSUER,
    });
    if (
      typeof payload === 'string' ||
      typeof payload.userId !== 'string' ||
      payload.role !== account ||
      typeof payload.sessionExp !== 'number' ||
      payload.sessionExp * 1000 <= Date.now()
    ) {
      return null;
    }
    return { id: payload.userId, expiresAt: payload.sessionExp * 1000 };
  } catch {
    return null;
  }
}

/**
 * Checks an access token issued by auth-service for one account type. Returns null when
 * it's missing, expired, forged or meant for another account; throws only when the
 * service itself is missing the secret.
 */
export function verifyAccessToken(
  token: string | undefined,
  account: AccountType,
): VerifiedAccess | null {
  const secret = secretFor(account);
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret, {
      audience: account,
      issuer: TOKEN_ISSUER,
    });
    if (
      typeof payload === 'string' ||
      typeof payload.userId !== 'string' ||
      payload.role !== account ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }
    return { id: payload.userId, expiresAt: payload.exp * 1000 };
  } catch {
    return null;
  }
}

/** Reads one cookie from a raw Cookie header, e.g. on a WebSocket upgrade request. */
export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const separator = part.indexOf('=');
    if (separator === -1 || part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

/** The account's access token from its cookie, falling back to an `Authorization: Bearer` header. */
export function readAccessToken(
  headers: { cookie?: string; authorization?: string },
  account: AccountType,
): string | undefined {
  const fromCookie = readCookie(headers.cookie, ACCESS_TOKEN_COOKIES[account]);
  if (fromCookie) return fromCookie;
  const header = headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}
