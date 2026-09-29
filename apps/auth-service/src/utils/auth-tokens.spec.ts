import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '@org/errors';
import {
  TOKEN_ISSUER,
  TOKEN_POLICIES,
  clearAuthCookies,
  getTokenSecrets,
  readToken,
  setAuthCookies,
  signAccessToken,
  signRefreshToken,
  verifyToken,
} from './auth-tokens';

function mockResponse() {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response & {
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
  };
}

function expectUnauthorized(run: () => unknown) {
  try {
    run();
    expect.unreachable();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(401);
  }
}

describe('auth tokens', () => {
  beforeEach(() => {
    vi.stubEnv('ACCESS_TOKEN_SECRET', 'access-secret');
    vi.stubEnv('REFRESH_TOKEN_SECRET', 'refresh-secret');
    vi.stubEnv('SELLER_ACCESS_TOKEN_SECRET', 'seller-access-secret');
    vi.stubEnv('SELLER_REFRESH_TOKEN_SECRET', 'seller-refresh-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('round-trips access and refresh tokens with their own secrets', () => {
    const access = signAccessToken({ userId: 'u1', role: 'user' }, 'user');
    const refresh = signRefreshToken(
      { userId: 'u1', role: 'user', rememberMe: false },
      'session-1',
      'user',
    );

    expect(verifyToken(access, 'access', 'user')).toMatchObject({
      userId: 'u1',
      role: 'user',
      aud: 'user',
      iss: TOKEN_ISSUER,
    });
    expect(verifyToken(refresh, 'refresh', 'user')).toMatchObject({
      userId: 'u1',
      rememberMe: false,
      jti: 'session-1',
    });
    expect(() => verifyToken(access, 'refresh', 'user')).toThrow(AppError);
  });

  it('rejects missing, expired and tampered tokens with a 401', () => {
    const expired = jwt.sign({ userId: 'u1', role: 'user' }, 'access-secret', {
      expiresIn: -10,
      audience: 'user',
      issuer: TOKEN_ISSUER,
    });

    for (const token of [undefined, expired, 'not-a-jwt']) {
      expectUnauthorized(() => verifyToken(token, 'access', 'user'));
    }
  });

  describe('keeping shopper and seller tokens apart', () => {
    it('signs seller tokens with the seller secrets and audience', () => {
      const access = signAccessToken(
        { userId: 's1', role: 'seller' },
        'seller',
      );

      expect(verifyToken(access, 'access', 'seller')).toMatchObject({
        userId: 's1',
        aud: 'seller',
      });
      expect(() => jwt.verify(access, 'seller-access-secret')).not.toThrow();
      expect(() => jwt.verify(access, 'access-secret')).toThrow();
    });

    it('refuses a seller token where a shopper token is expected, and the reverse', () => {
      const seller = signAccessToken(
        { userId: 's1', role: 'seller' },
        'seller',
      );
      const shopper = signAccessToken({ userId: 'u1', role: 'user' }, 'user');

      expectUnauthorized(() => verifyToken(seller, 'access', 'user'));
      expectUnauthorized(() => verifyToken(shopper, 'access', 'seller'));
    });

    it('refuses a token for the wrong audience even when signed with the right secret', () => {
      const wrongAudience = jwt.sign(
        { userId: 's1', role: 'seller' },
        'access-secret',
        { audience: 'seller', issuer: TOKEN_ISSUER, expiresIn: 60 },
      );
      const noAudience = jwt.sign(
        { userId: 'u1', role: 'user' },
        'access-secret',
        { issuer: TOKEN_ISSUER, expiresIn: 60 },
      );

      expectUnauthorized(() => verifyToken(wrongAudience, 'access', 'user'));
      expectUnauthorized(() => verifyToken(noAudience, 'access', 'user'));
    });

    it('refuses a token from another issuer', () => {
      const foreign = jwt.sign(
        { userId: 'u1', role: 'user' },
        'access-secret',
        {
          audience: 'user',
          issuer: 'someone-else',
          expiresIn: 60,
        },
      );

      expectUnauthorized(() => verifyToken(foreign, 'access', 'user'));
    });

    it('refuses a role the account may not hold', () => {
      const sellerRoleOnShopper = jwt.sign(
        { userId: 'u1', role: 'seller' },
        'access-secret',
        { audience: 'user', issuer: TOKEN_ISSUER, expiresIn: 60 },
      );

      expectUnauthorized(() =>
        verifyToken(sellerRoleOnShopper, 'access', 'user'),
      );
    });
  });

  describe('lifetimes', () => {
    const lifetime = (token: string) => {
      const { exp, iat } = jwt.decode(token) as { exp: number; iat: number };
      return exp - iat;
    };

    it('gives both accounts 15 minute access tokens', () => {
      expect(
        lifetime(signAccessToken({ userId: 'u1', role: 'user' }, 'user')),
      ).toBe(15 * 60);
      expect(
        lifetime(signAccessToken({ userId: 's1', role: 'seller' }, 'seller')),
      ).toBe(15 * 60);
    });

    it('ends idle seller sessions sooner than shopper sessions', () => {
      const shopper = signRefreshToken(
        { userId: 'u1', role: 'user' },
        'a',
        'user',
      );
      const seller = signRefreshToken(
        { userId: 's1', role: 'seller' },
        'b',
        'seller',
      );

      expect(lifetime(shopper)).toBe(7 * 24 * 60 * 60);
      expect(lifetime(seller)).toBe(24 * 60 * 60);
      expect(lifetime(seller)).toBeLessThan(lifetime(shopper));
    });

    it('matches remembered cookie lifetimes to the refresh token', () => {
      const tokens = { accessToken: 'a', refreshToken: 'r' };
      const shopper = mockResponse();
      const seller = mockResponse();

      setAuthCookies(shopper, tokens, true, 'user');
      setAuthCookies(seller, tokens, true, 'seller');

      for (const [, , options] of shopper.cookie.mock.calls) {
        expect(options.maxAge).toBe(
          TOKEN_POLICIES.user.refreshTtlSeconds * 1000,
        );
      }
      for (const [, , options] of seller.cookie.mock.calls) {
        expect(options.maxAge).toBe(
          TOKEN_POLICIES.seller.refreshTtlSeconds * 1000,
        );
      }
    });
  });

  describe('secrets', () => {
    it('requires each account to have its own secrets set', () => {
      vi.stubEnv('SELLER_ACCESS_TOKEN_SECRET', '');

      expect(() => getTokenSecrets('seller')).toThrow(
        'SELLER_ACCESS_TOKEN_SECRET and SELLER_REFRESH_TOKEN_SECRET must be set in .env',
      );
      expect(() => getTokenSecrets('user')).not.toThrow();
    });

    it('refuses the same secret for access and refresh tokens', () => {
      vi.stubEnv('SELLER_REFRESH_TOKEN_SECRET', 'seller-access-secret');

      expect(() => getTokenSecrets('seller')).toThrow(/must be different/);
    });

    it('refuses a seller secret shared with the shopper secrets', () => {
      vi.stubEnv('SELLER_ACCESS_TOKEN_SECRET', 'access-secret');

      expect(() => getTokenSecrets('seller')).toThrow(
        'Shopper and seller token secrets must all be different',
      );
      expect(() => getTokenSecrets('user')).toThrow(
        'Shopper and seller token secrets must all be different',
      );
    });
  });

  it('uses session cookies when remember me is off', () => {
    const tokens = { accessToken: 'a', refreshToken: 'r' };

    const remembered = mockResponse();
    setAuthCookies(remembered, tokens, true);
    expect(remembered.cookie).toHaveBeenCalledWith(
      'accessToken',
      'a',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: expect.any(Number),
      }),
    );

    const session = mockResponse();
    setAuthCookies(session, tokens, false);
    for (const [, , options] of session.cookie.mock.calls) {
      expect(options.maxAge).toBeUndefined();
    }
  });

  it('clears both cookies', () => {
    const res = mockResponse();
    clearAuthCookies(res);

    expect(res.clearCookie.mock.calls.map(([name]) => name)).toEqual([
      'accessToken',
      'refreshToken',
    ]);
  });

  it('keeps seller cookies separate from shopper cookies', () => {
    const res = mockResponse();
    setAuthCookies(
      res,
      { accessToken: 'a', refreshToken: 'r' },
      true,
      'seller',
    );
    clearAuthCookies(res, 'seller');

    expect(res.cookie.mock.calls.map(([name]) => name).sort()).toEqual([
      'sellerAccessToken',
      'sellerRefreshToken',
    ]);
    expect(res.clearCookie.mock.calls.map(([name]) => name)).toEqual([
      'sellerAccessToken',
      'sellerRefreshToken',
    ]);
  });

  it('reads tokens from cookies or a bearer header', () => {
    expect(
      readToken({ cookies: { accessToken: 'c' }, headers: {} }, 'accessToken'),
    ).toBe('c');
    expect(
      readToken(
        { cookies: {}, headers: { authorization: 'Bearer h' } },
        'accessToken',
      ),
    ).toBe('h');
    expect(readToken({ headers: {} }, 'accessToken')).toBeUndefined();
  });
});
