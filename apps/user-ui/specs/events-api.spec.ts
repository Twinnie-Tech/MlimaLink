import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendKafkaEvent } from '../src/actions/track-user';
import { trackUserActivity } from '../src/app/shared/utils/events-api';

vi.mock('../src/actions/track-user', () => ({ sendKafkaEvent: vi.fn() }));

const send = vi.mocked(sendKafkaEvent);

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue(true);
});

describe('trackUserActivity', () => {
  it('hands the activity to the sendKafkaEvent server action', () => {
    const productId = 'c'.repeat(24);

    trackUserActivity({ action: 'add_to_cart', productId });

    expect(send).toHaveBeenCalledWith({ action: 'add_to_cart', productId });
  });

  it('skips sample listings, which aren’t in the database', () => {
    trackUserActivity({ action: 'add_to_wishlist', productId: '1' });
    trackUserActivity({ action: 'shop_visit', shopId: 'shop1' });

    expect(send).not.toHaveBeenCalled();
  });

  it('swallows failures', async () => {
    send.mockRejectedValueOnce(new TypeError('offline'));

    expect(() =>
      trackUserActivity({ action: 'shop_visit', shopId: 'b'.repeat(24) }),
    ).not.toThrow();
    await Promise.resolve();
  });
});
