const producer = { send: vi.fn() };
const getProducer = vi.fn();

vi.mock('../kafka/index.js', () => ({ getProducer }));

const {
  USER_EVENTS_TOPIC,
  parseUserEvent,
  parseUserEventInput,
  sendUserEvent,
  sendUserEvents,
} = await import('./index.js');

const userId = 'a'.repeat(24);
const shopId = 'b'.repeat(24);
const productId = 'c'.repeat(24);
const timestamp = '2026-10-05T16:00:00.000Z';

describe('parseUserEventInput', () => {
  it('accepts a shop visit and a product action', () => {
    expect(parseUserEventInput({ action: 'shop_visit', shopId })).toEqual({
      event: { action: 'shop_visit', shopId },
    });
    expect(parseUserEventInput({ action: 'add_to_cart', productId })).toEqual({
      event: { action: 'add_to_cart', productId },
    });
  });

  it.each(['product_view', 'remove_from_wishlist', 'remove_from_cart'])(
    'accepts %s with a productId',
    (action) => {
      expect(parseUserEventInput({ action, productId })).toEqual({
        event: { action, productId },
      });
      expect(parseUserEventInput({ action })).toEqual({
        error: `${action} needs a productId.`,
      });
    },
  );

  it.each([
    [{ action: 'checkout', productId }, 'action must be one of'],
    [{ action: 'purchase', productId }, 'action must be one of'],
    [{ action: 'shop_visit' }, 'A shop visit needs a shopId.'],
    [{ action: 'add_to_wishlist' }, 'add_to_wishlist needs a productId.'],
    [{ action: 'add_to_cart', productId: '42' }, 'productId must be'],
    [{ action: 'shop_visit', shopId: { $ne: null } }, 'shopId must be'],
  ])('rejects %j', (body, error) => {
    expect(parseUserEventInput(body)).toEqual({
      error: expect.stringContaining(error),
    });
  });

  it('keeps the device and location', () => {
    expect(
      parseUserEventInput({
        action: 'product_view',
        productId,
        device: 'mobile',
        country: ' KE ',
        city: 'Nairobi',
      }),
    ).toEqual({
      event: {
        action: 'product_view',
        productId,
        device: 'mobile',
        country: 'KE',
        city: 'Nairobi',
      },
    });
  });

  it('drops a device or location that doesn’t fit, keeping the event', () => {
    expect(
      parseUserEventInput({
        action: 'product_view',
        productId,
        device: 'fridge',
        country: '   ',
        city: 'x'.repeat(101),
      }),
    ).toEqual({ event: { action: 'product_view', productId } });
  });
});

describe('parseUserEvent', () => {
  it('reads a published event and drops unknown fields', () => {
    const raw = JSON.stringify({
      userId,
      action: 'add_to_wishlist',
      productId,
      shopId,
      timestamp,
      extra: 'ignored',
    });

    expect(parseUserEvent(raw)).toEqual({
      userId,
      action: 'add_to_wishlist',
      productId,
      shopId,
      timestamp,
    });
  });

  it('reads purchases, which only the api publishes', () => {
    const raw = JSON.stringify({
      userId,
      action: 'purchase',
      productId,
      shopId,
      timestamp,
    });

    expect(parseUserEvent(raw)).toMatchObject({ action: 'purchase' });
  });

  it('reads the device and location', () => {
    const raw = JSON.stringify({
      userId,
      action: 'product_view',
      productId,
      device: 'desktop',
      country: 'KE',
      city: 'Mombasa',
      timestamp,
    });

    expect(parseUserEvent(raw)).toEqual({
      userId,
      action: 'product_view',
      productId,
      device: 'desktop',
      country: 'KE',
      city: 'Mombasa',
      timestamp,
    });
  });

  it.each([
    undefined,
    'not json',
    JSON.stringify({ action: 'shop_visit', shopId, timestamp }),
    JSON.stringify({ userId, action: 'shop_visit', shopId, timestamp: 'soon' }),
    JSON.stringify({ userId, action: 'shop_visit', timestamp }),
  ])('returns null for %s', (raw) => {
    expect(parseUserEvent(raw)).toBeNull();
  });
});

describe('sendUserEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProducer.mockResolvedValue(producer);
  });

  it('publishes to user_events keyed by user', async () => {
    const event = {
      userId,
      action: 'shop_visit' as const,
      shopId,
      timestamp,
    };

    expect(await sendUserEvent(event)).toBe(true);
    expect(producer.send).toHaveBeenCalledWith({
      topic: USER_EVENTS_TOPIC,
      messages: [{ key: userId, value: JSON.stringify(event) }],
    });
  });

  it('sends several events in one request', async () => {
    const purchase = (id: string) => ({
      userId,
      action: 'purchase' as const,
      productId: id,
      shopId,
      timestamp,
    });

    await sendUserEvents([purchase(productId), purchase('d'.repeat(24))]);

    expect(producer.send).toHaveBeenCalledTimes(1);
    expect(producer.send.mock.calls[0][0].messages).toHaveLength(2);
  });

  it('skips Kafka when there is nothing to send', async () => {
    expect(await sendUserEvents([])).toBe(true);
    expect(getProducer).not.toHaveBeenCalled();
  });

  it('reports failure instead of throwing', async () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    getProducer.mockRejectedValueOnce(new Error('broker down'));

    expect(
      await sendUserEvent({ userId, action: 'shop_visit', shopId, timestamp }),
    ).toBe(false);
    expect(error).toHaveBeenCalledWith(
      "Couldn't send user event to Kafka: broker down",
    );
    error.mockRestore();
  });
});
