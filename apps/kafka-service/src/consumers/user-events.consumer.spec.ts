import type { EachMessagePayload } from 'kafkajs';
import {
  updateProductAnalytics,
  updateShopAnalytics,
  updateUserAnalytics,
} from '../services/analytics.service';
import {
  USER_EVENTS_GROUP,
  eventQueue,
  processQueue,
  startUserEventsConsumer,
} from './user-events.consumer';

const consumer = {
  connect: vi.fn(),
  subscribe: vi.fn(),
  run: vi.fn(),
  disconnect: vi.fn(),
};
const admin = {
  connect: vi.fn(),
  listTopics: vi.fn(),
  createTopics: vi.fn(),
  disconnect: vi.fn(),
};
const kafka = { consumer: vi.fn(() => consumer), admin: () => admin };

vi.mock('@org/utils/kafka', () => ({ getKafka: () => kafka }));
vi.mock('../services/analytics.service', () => ({
  updateProductAnalytics: vi.fn(),
  updateShopAnalytics: vi.fn(),
  updateUserAnalytics: vi.fn(),
}));

const userId = 'a'.repeat(24);
const shopId = 'b'.repeat(24);
const productId = 'c'.repeat(24);
const timestamp = '2026-10-05T16:00:00.000Z';

const visit = { userId, action: 'shop_visit' as const, shopId, timestamp };
const wishlist = {
  userId,
  action: 'add_to_wishlist' as const,
  productId,
  shopId,
  timestamp,
};

beforeEach(() => {
  vi.clearAllMocks();
  eventQueue.length = 0;
  admin.disconnect.mockResolvedValue(undefined);
  admin.listTopics.mockResolvedValue(['user_events']);
  consumer.disconnect.mockResolvedValue(undefined);
});

describe('processQueue', () => {
  it('sends shop visits to shop analytics and product actions to user analytics', async () => {
    eventQueue.push(visit, wishlist);

    await processQueue();

    expect(updateShopAnalytics).toHaveBeenCalledWith(visit);
    expect(updateUserAnalytics).toHaveBeenCalledWith(wishlist);
    expect(updateUserAnalytics).toHaveBeenCalledTimes(1);
    expect(updateProductAnalytics).toHaveBeenCalledWith(wishlist);
    expect(updateProductAnalytics).toHaveBeenCalledTimes(1);
    expect(eventQueue).toHaveLength(0);
  });

  it('keeps going when one write fails', async () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    vi.mocked(updateShopAnalytics).mockRejectedValueOnce(new Error('db down'));
    eventQueue.push(visit, wishlist);

    await processQueue();

    expect(error).toHaveBeenCalledWith(
      `Couldn't record shop_visit for user ${userId}: db down`,
    );
    expect(updateUserAnalytics).toHaveBeenCalledWith(wishlist);
    error.mockRestore();
  });

  it('shares one run between overlapping calls', async () => {
    eventQueue.push(visit);

    await Promise.all([processQueue(), processQueue()]);

    expect(updateShopAnalytics).toHaveBeenCalledTimes(1);
  });
});

describe('startUserEventsConsumer', () => {
  it('reads new user_events into the queue and writes them when stopped', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const stop = await startUserEventsConsumer();

    expect(kafka.consumer).toHaveBeenCalledWith({ groupId: USER_EVENTS_GROUP });
    expect(consumer.subscribe).toHaveBeenCalledWith({
      topic: 'user_events',
      fromBeginning: false,
    });

    const { eachMessage } = consumer.run.mock.calls[0][0] as {
      eachMessage: (payload: EachMessagePayload) => Promise<void>;
    };
    const deliver = (value: string, offset: string) =>
      eachMessage({ message: { value: Buffer.from(value), offset } } as never);
    await deliver(JSON.stringify(visit), '1');
    await deliver('not json', '2');

    expect(eventQueue).toEqual([visit]);
    expect(warn).toHaveBeenCalledWith(
      'Skipped a malformed message on user_events at offset 2.',
    );

    await stop();

    expect(consumer.disconnect).toHaveBeenCalled();
    expect(updateShopAnalytics).toHaveBeenCalledWith(visit);
    warn.mockRestore();
  });

  it('creates the topic only when it’s missing', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await (
      await startUserEventsConsumer()
    )();
    expect(admin.createTopics).not.toHaveBeenCalled();

    admin.listTopics.mockResolvedValueOnce([]);
    await (
      await startUserEventsConsumer()
    )();
    expect(admin.createTopics).toHaveBeenCalledWith({
      topics: [{ topic: 'user_events' }],
    });
    log.mockRestore();
  });

  it('still starts when the topic can’t be created', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    admin.listTopics.mockResolvedValueOnce([]);
    admin.createTopics.mockRejectedValueOnce(new Error('not authorized'));

    const stop = await startUserEventsConsumer();

    expect(warn).toHaveBeenCalledWith(
      "Couldn't make sure the user_events topic exists: not authorized",
    );
    expect(consumer.run).toHaveBeenCalled();
    await stop();
    warn.mockRestore();
  });
});
