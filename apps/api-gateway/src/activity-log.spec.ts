import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyAccessToken, type AccountType } from '@org/utils/auth';
import { activityLogger, describeRequest, requester } from './activity-log';

vi.mock('@org/utils/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@org/utils/auth')>()),
  verifyAccessToken: vi.fn(),
}));

const ids: Record<AccountType, string> = {
  user: 'a'.repeat(24),
  seller: 'b'.repeat(24),
  admin: 'e'.repeat(24),
};

beforeEach(() => {
  vi.clearAllMocks();
  // A token is valid for the account it's named after, e.g. "seller-token".
  vi.mocked(verifyAccessToken).mockImplementation((token, account) =>
    token === `${account}-token`
      ? { id: ids[account], expiresAt: Date.now() + 60_000 }
      : null,
  );
});

function request(
  url: string,
  headers: Record<string, string> = {},
  method = 'GET',
): IncomingMessage {
  return {
    method,
    url,
    headers,
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage;
}

const cookies = (...accounts: AccountType[]) =>
  accounts
    .map((account) => {
      const name = {
        user: 'accessToken',
        seller: 'sellerAccessToken',
        admin: 'adminAccessToken',
      }[account];
      return `${name}=${account}-token`;
    })
    .join('; ');

describe('requester', () => {
  it('is a guest without a valid token', () => {
    expect(requester(request('/api/products'))).toBeNull();
    expect(
      requester(request('/api/products', { cookie: 'accessToken=forged' })),
    ).toBeNull();
  });

  it('is the one account signed in', () => {
    expect(
      requester(request('/api/products', { cookie: cookies('seller') })),
    ).toEqual({ role: 'seller', id: ids.seller });
  });

  it('picks between several accounts by ?as=, the path, then the UI it came from', () => {
    const all = { cookie: cookies('user', 'seller', 'admin') };

    expect(requester(request('/api/chat/unseen?as=seller', all))?.role).toBe(
      'seller',
    );
    expect(requester(request('/api/admin/overview', all))?.role).toBe('admin');
    expect(requester(request('/api/auth/login/admin', all))?.role).toBe(
      'admin',
    );
    expect(requester(request('/api/seller/orders', all))?.role).toBe('seller');
    expect(
      requester(
        request('/api/products', { ...all, origin: 'http://localhost:4300' }),
      )?.role,
    ).toBe('seller');
    expect(
      requester(
        request('/api/products', {
          ...all,
          referer: 'http://localhost:4200/shops/1',
        }),
      )?.role,
    ).toBe('user');
  });
});

describe('describeRequest', () => {
  it('says who did what, how it went and how long it took, without the query string', () => {
    const entry = describeRequest(
      request(
        '/api/auth/reset-password?token=secret',
        { cookie: cookies('user'), 'x-forwarded-for': '41.90.1.2, 10.0.0.1' },
        'POST',
      ),
      200,
      182.4,
    );

    expect(entry).toMatchObject({
      level: 'info',
      source: 'api-gateway',
      message: `POST /api/auth/reset-password 200 182ms · user ${ids.user}`,
      meta: {
        kind: 'request',
        method: 'POST',
        path: '/api/auth/reset-password',
        status: 200,
        durationMs: 182,
        account: `user:${ids.user}`,
        ip: '41.90.1.2',
      },
    });
    expect(JSON.stringify(entry)).not.toContain('secret');
  });

  it('warns on client errors and flags server errors', () => {
    expect(describeRequest(request('/api/x'), 404, 5)).toMatchObject({
      level: 'warn',
      message: 'GET /api/x 404 5ms · guest',
    });
    expect(describeRequest(request('/api/x'), 502, 5).level).toBe('error');
  });
});

describe('activityLogger', () => {
  const respond = (status: number) =>
    Object.assign(new EventEmitter(), {
      statusCode: status,
    }) as unknown as ServerResponse;

  it('publishes a line once the response is sent', () => {
    const publish = vi.fn();
    let clock = 1000;
    const middleware = activityLogger(publish, () => clock);
    const req = request('/api/products');
    const res = respond(200);
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();

    clock = 1034;
    res.emit('finish');
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'GET /api/products 200 34ms · guest',
      }),
    );
  });

  it('leaves out preflights and the log feed itself', () => {
    const publish = vi.fn();
    const middleware = activityLogger(publish);

    for (const req of [
      request('/api/products', {}, 'OPTIONS'),
      request('/api/logs?limit=200'),
      request('/api/logs/ws'),
    ]) {
      const res = respond(200);
      middleware(req, res, vi.fn());
      res.emit('finish');
    }
    expect(publish).not.toHaveBeenCalled();
  });
});
