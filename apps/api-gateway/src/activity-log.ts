import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  ACCOUNT_TYPES,
  isAccountType,
  readAccessToken,
  verifyAccessToken,
  type AccountType,
} from '@org/utils/auth';
import { createLogEntry, type LogEntry, type LogLevel } from '@org/utils/logs';

export const GATEWAY_SOURCE = 'api-gateway';

export interface Requester {
  role: AccountType;
  id: string;
}

type Request = IncomingMessage & { originalUrl?: string };

const UI_URL_ENV: Record<AccountType, [string, string]> = {
  user: ['USER_UI_URL', 'http://localhost:4200'],
  seller: ['SELLER_UI_URL', 'http://localhost:4300'],
  admin: ['ADMIN_UI_URL', 'http://localhost:4400'],
};

function originOf(url: string | undefined): string | undefined {
  try {
    return url ? new URL(url).origin : undefined;
  } catch {
    return undefined;
  }
}

/** Which account the request is for, judging by `?as=`, the path, then the UI it came from. */
function accountHint(url: URL, origin: string | undefined): AccountType | null {
  const as = url.searchParams.get('as');
  if (isAccountType(as)) return as;
  const words = url.pathname.toLowerCase().split(/[/-]/);
  if (words.includes('admin') || words.includes('admins')) return 'admin';
  if (words.includes('seller') || words.includes('sellers')) return 'seller';
  const from = originOf(origin);
  if (!from) return null;
  return (
    ACCOUNT_TYPES.find((role) => {
      const [name, fallback] = UI_URL_ENV[role];
      return originOf(process.env[name] ?? fallback) === from;
    }) ?? null
  );
}

/**
 * Who sent the request, from a valid access token. One browser can be signed in as a
 * shopper, a seller and an admin at once, since cookies are shared across localhost
 * ports, so with several the request's account hint decides.
 */
export function requester(req: Request): Requester | null {
  const headers = {
    cookie: req.headers.cookie,
    authorization: req.headers.authorization,
  };
  const signedIn = ACCOUNT_TYPES.flatMap((role): Requester[] => {
    try {
      const verified = verifyAccessToken(readAccessToken(headers, role), role);
      return verified ? [{ role, id: verified.id }] : [];
    } catch {
      return [];
    }
  });
  if (signedIn.length <= 1) return signedIn[0] ?? null;
  const url = new URL(req.originalUrl ?? req.url ?? '/', 'http://gateway');
  const hint = accountHint(
    url,
    req.headers.origin ?? (req.headers.referer as string | undefined),
  );
  return signedIn.find(({ role }) => role === hint) ?? signedIn[0];
}

const levelFor = (status: number): LogLevel =>
  status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

function clientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
    ?.split(',')[0]
    ?.trim();
  return first || req.socket?.remoteAddress || undefined;
}

/**
 * One line per request: method, path (without the query string, which can hold reset
 * tokens), status, time taken and who sent it.
 */
export function describeRequest(
  req: Request,
  status: number,
  durationMs: number,
): LogEntry {
  const method = req.method ?? 'GET';
  const path = new URL(req.originalUrl ?? req.url ?? '/', 'http://gateway')
    .pathname;
  const who = requester(req);
  const ms = Math.round(durationMs);
  return createLogEntry(
    levelFor(status),
    `${method} ${path} ${status} ${ms}ms · ${who ? `${who.role} ${who.id}` : 'guest'}`,
    GATEWAY_SOURCE,
    {
      kind: 'request',
      method,
      path,
      status,
      durationMs: ms,
      account: who ? `${who.role}:${who.id}` : null,
      ip: clientIp(req),
    },
  );
}

/** CORS preflights and the log feed itself aren't activity worth a line. */
const skipped = (method: string | undefined, path: string) =>
  method === 'OPTIONS' || path === '/api/logs' || path.startsWith('/api/logs/');

/** Express middleware that passes a line to `publish` once each response is sent. */
export function activityLogger(
  publish: (entry: LogEntry) => void,
  now: () => number = () => performance.now(),
) {
  return (req: Request, res: ServerResponse, next: () => void) => {
    const path = new URL(req.originalUrl ?? req.url ?? '/', 'http://gateway')
      .pathname;
    if (skipped(req.method, path)) {
      next();
      return;
    }
    const started = now();
    res.on('finish', () => {
      try {
        publish(describeRequest(req, res.statusCode, now() - started));
      } catch (error) {
        console.error('Couldn’t log a request:', error);
      }
    });
    next();
  };
}
