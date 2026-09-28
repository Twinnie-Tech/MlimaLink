import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { AppError, unauthorized } from '@org/errors';
import {
  AUTH_COOKIE_NAMES,
  clearAuthCookies,
  readToken,
  setAuthCookies,
  signAccessToken,
  signRefreshToken,
  verifyToken,
  type AuthAccount,
} from './auth-tokens';
import { ensureRedisConnected, redisClient } from './redis.client';

/** Matches the refresh token's 7 day lifetime. */
const REFRESH_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
/**
 * A rotated refresh token stays usable this long, so parallel requests (e.g. two tabs)
 * that still carry it don't sign the user out.
 */
export const ROTATION_GRACE_SECONDS = 30;

const sessionKey = (sessionId: string) => `refresh_session:${sessionId}`;
const userSessionsKey = (userId: string) => `refresh_sessions:${userId}`;

export async function createRefreshSession(userId: string): Promise<string> {
  const sessionId = randomUUID();
  await ensureRedisConnected();
  await redisClient
    .multi()
    .set(sessionKey(sessionId), userId, 'EX', REFRESH_SESSION_TTL_SECONDS)
    .sadd(userSessionsKey(userId), sessionId)
    .expire(userSessionsKey(userId), REFRESH_SESSION_TTL_SECONDS)
    .exec();
  return sessionId;
}

export async function isRefreshSessionActive(
  userId: string,
  sessionId: string,
): Promise<boolean> {
  await ensureRedisConnected();
  return (await redisClient.get(sessionKey(sessionId))) === userId;
}

/** Ends one session, either now or after a grace period. */
export async function endRefreshSession(
  userId: string,
  sessionId: string,
  graceSeconds = 0,
): Promise<void> {
  await ensureRedisConnected();
  if (graceSeconds > 0) {
    await redisClient.expire(sessionKey(sessionId), graceSeconds);
    return;
  }
  await redisClient
    .multi()
    .del(sessionKey(sessionId))
    .srem(userSessionsKey(userId), sessionId)
    .exec();
}

/** Signs the user out on every device. */
export async function endAllRefreshSessions(userId: string): Promise<void> {
  await ensureRedisConnected();
  const sessionIds = await redisClient.smembers(userSessionsKey(userId));
  await redisClient.del(userSessionsKey(userId), ...sessionIds.map(sessionKey));
}

/** Starts a new session and sets fresh access and refresh cookies for it. */
export async function issueAuthCookies(
  res: Response,
  user: { userId: string; role: string; rememberMe: boolean },
  account: AuthAccount = 'user',
): Promise<void> {
  const sessionId = await createRefreshSession(user.userId);
  setAuthCookies(
    res,
    {
      accessToken: signAccessToken(user),
      refreshToken: signRefreshToken(user, sessionId),
    },
    user.rememberMe,
    account,
  );
}

type TokenRequest = Parameters<typeof readToken>[0];

/**
 * Swaps a valid refresh token for new access and refresh cookies.
 * `findRole` returns the account's current role, or null when it no longer exists.
 */
export async function rotateAuthSession(
  req: TokenRequest,
  res: Response,
  account: AuthAccount,
  findRole: (accountId: string) => Promise<string | null>,
): Promise<void> {
  const { userId, jti, rememberMe } = verifyToken(
    readToken(req, AUTH_COOKIE_NAMES[account].refresh),
    'refresh',
  );

  const sessionActive =
    jti !== undefined && (await isRefreshSessionActive(userId, jti));
  const role = sessionActive ? await findRole(userId) : null;

  if (!jti || !role) {
    clearAuthCookies(res, account);
    throw unauthorized('Session expired! Please log in again.');
  }

  await endRefreshSession(userId, jti, ROTATION_GRACE_SECONDS);
  await issueAuthCookies(
    res,
    { userId, role, rememberMe: rememberMe ?? true },
    account,
  );
}

/** Ends the session behind the request's refresh cookie, if it still has one. */
export async function endSessionFromRequest(
  req: TokenRequest,
  account: AuthAccount,
): Promise<void> {
  try {
    const { userId, jti } = verifyToken(
      readToken(req, AUTH_COOKIE_NAMES[account].refresh),
      'refresh',
    );
    if (jti) {
      await endRefreshSession(userId, jti);
    }
  } catch (error) {
    // An expired or missing refresh token has no session left to end.
    if (!(error instanceof AppError && error.statusCode === 401)) {
      console.error(
        '[auth] Failed to end session on logout:',
        error instanceof Error ? error.message : error,
      );
    }
  }
}
