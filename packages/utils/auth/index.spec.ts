import jwt from 'jsonwebtoken';
import {
  SOCKET_TICKET_SECONDS,
  issueSocketTicket,
  readAccessToken,
  readCookie,
  verifyAccessToken,
  verifySocketTicket,
} from './index.js';

const SELLER_SECRET = 's'.repeat(64);
const USER_SECRET = 'u'.repeat(64);
const sellerId = 'a'.repeat(24);

const sign = (
  payload: object,
  secret = SELLER_SECRET,
  options: jwt.SignOptions = {},
) =>
  jwt.sign(payload, secret, {
    audience: 'seller',
    issuer: 'mlimalink-auth',
    expiresIn: 900,
    ...options,
  });

beforeEach(() => {
  vi.stubEnv('SELLER_ACCESS_TOKEN_SECRET', SELLER_SECRET);
  vi.stubEnv('ACCESS_TOKEN_SECRET', USER_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('verifyAccessToken', () => {
  it('returns the account id and expiry of a valid token', () => {
    const verified = verifyAccessToken(
      sign({ userId: sellerId, role: 'seller' }),
      'seller',
    );

    expect(verified?.id).toBe(sellerId);
    expect(verified?.expiresAt).toBeGreaterThan(Date.now());
  });

  it('rejects tokens meant for another account', () => {
    const shopperToken = sign({ userId: sellerId, role: 'user' }, USER_SECRET, {
      audience: 'user',
    });

    expect(verifyAccessToken(shopperToken, 'seller')).toBeNull();
    expect(
      verifyAccessToken(sign({ userId: sellerId, role: 'user' }), 'seller'),
    ).toBeNull();
  });

  it('rejects missing, expired and foreign tokens', () => {
    expect(verifyAccessToken(undefined, 'seller')).toBeNull();
    expect(
      verifyAccessToken(
        sign({ userId: sellerId, role: 'seller' }, SELLER_SECRET, {
          expiresIn: -10,
        }),
        'seller',
      ),
    ).toBeNull();
    expect(
      verifyAccessToken(
        sign({ userId: sellerId, role: 'seller' }, SELLER_SECRET, {
          issuer: 'someone-else',
        }),
        'seller',
      ),
    ).toBeNull();
  });

  it('throws when the service has no secret', () => {
    vi.stubEnv('ADMIN_ACCESS_TOKEN_SECRET', '');
    expect(() => verifyAccessToken('token', 'admin')).toThrow(
      'ADMIN_ACCESS_TOKEN_SECRET must be set in .env',
    );
  });
});

describe('socket tickets', () => {
  const session = { id: sellerId, expiresAt: Date.now() + 10 * 60_000 };

  it('opens a socket for the session it was issued for', () => {
    const ticket = issueSocketTicket('seller', session);

    expect(verifySocketTicket(ticket, 'seller')).toEqual({
      id: sellerId,
      expiresAt: Math.floor(session.expiresAt / 1000) * 1000,
    });
  });

  it('works only as a ticket, for its own account', () => {
    const ticket = issueSocketTicket('seller', session);

    expect(verifyAccessToken(ticket, 'seller')).toBeNull();
    expect(verifySocketTicket(ticket, 'user')).toBeNull();
    expect(
      verifySocketTicket(sign({ userId: sellerId, role: 'seller' }), 'seller'),
    ).toBeNull();
  });

  it('rejects missing tickets, expired tickets and ended sessions', () => {
    expect(verifySocketTicket(undefined, 'seller')).toBeNull();

    vi.useFakeTimers();
    try {
      const ticket = issueSocketTicket('seller', session);
      vi.advanceTimersByTime((SOCKET_TICKET_SECONDS + 1) * 1000);
      expect(verifySocketTicket(ticket, 'seller')).toBeNull();
    } finally {
      vi.useRealTimers();
    }

    const ended = issueSocketTicket('seller', {
      id: sellerId,
      expiresAt: Date.now() - 1000,
    });
    expect(verifySocketTicket(ended, 'seller')).toBeNull();
  });
});

describe('readCookie', () => {
  it('finds a cookie among others and decodes it', () => {
    expect(
      readCookie(
        'accessToken=abc; sellerAccessToken=x%3Dy',
        'sellerAccessToken',
      ),
    ).toBe('x=y');
    expect(readCookie('accessToken=abc', 'adminAccessToken')).toBeUndefined();
    expect(readCookie(undefined, 'accessToken')).toBeUndefined();
  });
});

describe('readAccessToken', () => {
  it('prefers the account cookie and falls back to a bearer header', () => {
    expect(
      readAccessToken(
        { cookie: 'adminAccessToken=fromCookie', authorization: 'Bearer h' },
        'admin',
      ),
    ).toBe('fromCookie');
    expect(readAccessToken({ authorization: 'Bearer h' }, 'admin')).toBe('h');
    expect(
      readAccessToken({ cookie: 'accessToken=u' }, 'admin'),
    ).toBeUndefined();
  });
});
