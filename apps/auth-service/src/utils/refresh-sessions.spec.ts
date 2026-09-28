import type { Response } from 'express';
import type { FakeRedis } from '../testing/fake-redis';
import { signRefreshToken, verifyToken } from './auth-tokens';
import { redisClient } from './redis.client';
import {
  ROTATION_GRACE_SECONDS,
  createRefreshSession,
  endAllRefreshSessions,
  endRefreshSession,
  endSessionFromRequest,
  isRefreshSessionActive,
  issueAuthCookies,
  rotateAuthSession,
} from './refresh-sessions';

vi.mock('./redis.client', async () => {
  const { createFakeRedis } = await vi.importActual<
    typeof import('../testing/fake-redis')
  >('../testing/fake-redis');
  return {
    ensureRedisConnected: async () => undefined,
    redisClient: createFakeRedis(),
  };
});

const redis = redisClient as unknown as FakeRedis;

describe('refresh sessions', () => {
  beforeEach(() => {
    redis.reset();
    vi.stubEnv('ACCESS_TOKEN_SECRET', 'access-secret');
    vi.stubEnv('REFRESH_TOKEN_SECRET', 'refresh-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps a session active for its owner until it is ended', async () => {
    const sessionId = await createRefreshSession('u1');

    expect(await isRefreshSessionActive('u1', sessionId)).toBe(true);
    expect(await isRefreshSessionActive('u2', sessionId)).toBe(false);
    expect(redis.ttls.get(`refresh_session:${sessionId}`)).toBe(
      7 * 24 * 60 * 60,
    );

    await endRefreshSession('u1', sessionId);

    expect(await isRefreshSessionActive('u1', sessionId)).toBe(false);
    expect(redis.sets.get('refresh_sessions:u1')?.has(sessionId)).toBe(false);
  });

  it('keeps a rotated session usable only for the grace period', async () => {
    const sessionId = await createRefreshSession('u1');

    await endRefreshSession('u1', sessionId, ROTATION_GRACE_SECONDS);

    expect(await isRefreshSessionActive('u1', sessionId)).toBe(true);
    expect(redis.ttls.get(`refresh_session:${sessionId}`)).toBe(
      ROTATION_GRACE_SECONDS,
    );
  });

  it("ends every session of one user and nobody else's", async () => {
    const laptop = await createRefreshSession('u1');
    const phone = await createRefreshSession('u1');
    const otherUser = await createRefreshSession('u2');

    await endAllRefreshSessions('u1');

    expect(await isRefreshSessionActive('u1', laptop)).toBe(false);
    expect(await isRefreshSessionActive('u1', phone)).toBe(false);
    expect(await isRefreshSessionActive('u2', otherUser)).toBe(true);
  });

  it('sets cookies whose refresh token belongs to a new active session', async () => {
    const res = { cookie: vi.fn() };

    await issueAuthCookies(res as unknown as Response, {
      userId: 'u1',
      role: 'user',
      rememberMe: false,
    });

    const cookies = Object.fromEntries(
      res.cookie.mock.calls.map(([name, value, options]) => [
        name,
        { value, options },
      ]),
    );
    const refresh = verifyToken(cookies.refreshToken.value, 'refresh');

    expect(verifyToken(cookies.accessToken.value, 'access').userId).toBe('u1');
    expect(refresh).toMatchObject({ userId: 'u1', rememberMe: false });
    expect(await isRefreshSessionActive('u1', refresh.jti as string)).toBe(
      true,
    );
    expect(cookies.refreshToken.options.maxAge).toBeUndefined();
  });

  describe('logout', () => {
    const cookieRequest = (refreshToken: string) => ({
      cookies: { refreshToken },
      headers: {},
    });

    async function login(): Promise<string> {
      const res = { cookie: vi.fn() };
      await issueAuthCookies(res as unknown as Response, {
        userId: 'u1',
        role: 'user',
        rememberMe: true,
      });
      return refreshCookieOf(res);
    }

    async function rotate(refreshToken: string): Promise<string> {
      const res = { cookie: vi.fn(), clearCookie: vi.fn() };
      await rotateAuthSession(
        cookieRequest(refreshToken),
        res as unknown as Response,
        'user',
        async () => 'user',
      );
      return refreshCookieOf(res);
    }

    function refreshCookieOf(res: { cookie: ReturnType<typeof vi.fn> }) {
      const call = res.cookie.mock.calls.find(
        ([name]) => name === 'refreshToken',
      );
      return call?.[1] as string;
    }

    const sessionOf = (token: string) =>
      verifyToken(token, 'refresh').jti as string;

    it('also ends tokens rotated out during the grace period, but not other logins', async () => {
      const first = await login();
      const second = await rotate(first);
      const current = await rotate(second);
      const otherDevice = await login();

      await endSessionFromRequest(cookieRequest(current), 'user');

      for (const token of [first, second, current]) {
        expect(await isRefreshSessionActive('u1', sessionOf(token))).toBe(
          false,
        );
      }
      expect(await isRefreshSessionActive('u1', sessionOf(otherDevice))).toBe(
        true,
      );
      expect(redis.sets.get('refresh_sessions:u1')).toEqual(
        new Set([sessionOf(otherDevice)]),
      );
    });

    it('ends sessions rotated from a token issued before families existed', async () => {
      const legacySession = await createRefreshSession('u1');
      const legacy = signRefreshToken(
        { userId: 'u1', role: 'user' },
        legacySession,
      );
      const current = await rotate(legacy);

      await endSessionFromRequest(cookieRequest(current), 'user');

      expect(await isRefreshSessionActive('u1', legacySession)).toBe(false);
      expect(await isRefreshSessionActive('u1', sessionOf(current))).toBe(
        false,
      );
    });
  });
});
