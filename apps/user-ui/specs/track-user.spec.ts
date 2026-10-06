import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendKafkaEvent } from '../src/actions/track-user';
import type { UserActivity } from '../src/app/shared/utils/events-api';

const request = {
  cookies: new Map<string, string>(),
  headers: new Headers(),
};

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = request.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
  headers: async () => request.headers,
}));

const fetchMock = vi.fn();
const productId = 'c'.repeat(24);
const iphone =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';

beforeEach(() => {
  request.cookies = new Map([['accessToken', 'token-123']]);
  request.headers = new Headers({ 'user-agent': iphone });
  fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function sentBody() {
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

describe('sendKafkaEvent', () => {
  it('posts the event to the api as the signed-in shopper, with their device', async () => {
    expect(await sendKafkaEvent({ action: 'product_view', productId })).toBe(
      true,
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:3000/api/events');
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-123',
      },
    });
    expect(sentBody()).toEqual({
      action: 'product_view',
      productId,
      device: 'mobile',
    });
  });

  it('adds the location from the host’s geo-IP headers', async () => {
    request.headers.set('x-vercel-ip-country', 'KE');
    request.headers.set('x-vercel-ip-city', 'Nairobi%20West');

    await sendKafkaEvent({ action: 'shop_visit', shopId: 'b'.repeat(24) });

    expect(sentBody()).toEqual({
      action: 'shop_visit',
      shopId: 'b'.repeat(24),
      device: 'mobile',
      country: 'KE',
      city: 'Nairobi West',
    });
  });

  it('only forwards known fields, so callers can’t set the device or user', async () => {
    await sendKafkaEvent({
      action: 'add_to_cart',
      productId,
      device: 'desktop',
      userId: 'a'.repeat(24),
    } as UserActivity);

    expect(sentBody()).toEqual({
      action: 'add_to_cart',
      productId,
      device: 'mobile',
    });
  });

  it('sends nothing for guests', async () => {
    request.cookies.clear();

    expect(await sendKafkaEvent({ action: 'product_view', productId })).toBe(
      false,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports failure instead of throwing', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await sendKafkaEvent({ action: 'product_view', productId })).toBe(
      false,
    );

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect(await sendKafkaEvent({ action: 'product_view', productId })).toBe(
      false,
    );
  });
});
