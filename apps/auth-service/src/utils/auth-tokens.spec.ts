import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '@org/errors';
import {
  clearAuthCookies,
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

describe('auth tokens', () => {
  beforeEach(() => {
    vi.stubEnv('ACCESS_TOKEN_SECRET', 'access-secret');
    vi.stubEnv('REFRESH_TOKEN_SECRET', 'refresh-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('round-trips access and refresh tokens with their own secrets', () => {
    const access = signAccessToken({ userId: 'u1', role: 'user' });
    const refresh = signRefreshToken(
      { userId: 'u1', role: 'user', rememberMe: false },
      'session-1',
    );

    expect(verifyToken(access, 'access')).toMatchObject({
      userId: 'u1',
      role: 'user',
    });
    expect(verifyToken(refresh, 'refresh')).toMatchObject({
      userId: 'u1',
      rememberMe: false,
      jti: 'session-1',
    });
    expect(() => verifyToken(access, 'refresh')).toThrow(AppError);
  });

  it('rejects missing, expired and tampered tokens with a 401', () => {
    const expired = jwt.sign({ userId: 'u1', role: 'user' }, 'access-secret', {
      expiresIn: -10,
    });

    for (const token of [undefined, expired, 'not-a-jwt']) {
      try {
        verifyToken(token, 'access');
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).statusCode).toBe(401);
      }
    }
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
