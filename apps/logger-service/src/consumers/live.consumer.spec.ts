import type { EachMessagePayload } from 'kafkajs';
import { ensureTopic } from '@org/utils/kafka';
import { LiveLogHub } from '../live/hub';
import { liveGroupId, startLiveConsumer } from './live.consumer';

const consumer = {
  connect: vi.fn(),
  subscribe: vi.fn(),
  run: vi.fn(),
  disconnect: vi.fn(),
};
const kafka = { consumer: vi.fn(() => consumer) };

vi.mock('@org/utils/kafka', () => ({
  getKafka: () => kafka,
  ensureTopic: vi.fn(),
}));

const entry = {
  level: 'info',
  message: 'GET /api/products 200 12ms · guest',
  source: 'api-gateway',
  timestamp: '2026-10-13T10:00:00.000Z',
};

function receive(topic: string, value: string, offset = '7') {
  const { eachMessage } = consumer.run.mock.calls.at(-1)?.[0] as {
    eachMessage: (payload: EachMessagePayload) => Promise<void>;
  };
  return eachMessage({
    topic,
    partition: 2,
    message: { value: Buffer.from(value), offset },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  consumer.disconnect.mockResolvedValue(undefined);
});

describe('liveGroupId', () => {
  it('gives each instance its own group', () => {
    expect(liveGroupId('logs-1')).toBe('logger-live-logs-1');
    expect(liveGroupId()).toMatch(/^logger-live-.+-\d+$/);
  });
});

describe('startLiveConsumer', () => {
  it('streams both topics to the admins connected here, with an id per message', async () => {
    const hub = new LiveLogHub();
    const broadcast = vi.spyOn(hub, 'broadcast');
    const stop = await startLiveConsumer(hub, 'logs-1');

    expect(ensureTopic).toHaveBeenCalledWith(kafka, 'logs');
    expect(ensureTopic).toHaveBeenCalledWith(kafka, 'live_logs');
    expect(kafka.consumer).toHaveBeenCalledWith({
      groupId: 'logger-live-logs-1',
    });
    expect(consumer.subscribe).toHaveBeenCalledWith({
      topics: ['logs', 'live_logs'],
      fromBeginning: false,
    });

    await receive('live_logs', JSON.stringify(entry));
    await receive('logs', 'not json');

    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenCalledWith({
      id: 'live_logs-2-7',
      ...entry,
    });

    await stop();
    expect(consumer.disconnect).toHaveBeenCalled();
  });

  it('disconnects when it can’t subscribe', async () => {
    consumer.subscribe.mockRejectedValueOnce(new Error('not authorized'));

    await expect(startLiveConsumer(new LiveLogHub())).rejects.toThrow(
      'not authorized',
    );
    expect(consumer.disconnect).toHaveBeenCalled();
  });
});
