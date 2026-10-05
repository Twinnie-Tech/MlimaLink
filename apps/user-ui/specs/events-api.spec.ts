import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackUserActivity } from '../src/app/shared/utils/events-api';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('trackUserActivity', () => {
  it('posts the activity to /api/events with the session cookies', () => {
    const productId = 'c'.repeat(24);

    trackUserActivity({ action: 'add_to_cart', productId });

    expect(fetchMock).toHaveBeenCalledWith('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify({ action: 'add_to_cart', productId }),
    });
  });

  it('skips sample listings, which aren’t in the database', () => {
    trackUserActivity({ action: 'add_to_wishlist', productId: '1' });
    trackUserActivity({ action: 'shop_visit', shopId: 'shop1' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows network failures', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));

    expect(() =>
      trackUserActivity({ action: 'shop_visit', shopId: 'b'.repeat(24) }),
    ).not.toThrow();
    await Promise.resolve();
  });
});
