import type { EachBatchPayload } from 'kafkajs';
import { ensureTopic } from '@org/utils/kafka';
import { saveLogs } from '../logs/store';
import { LOGS_GROUP, startLogsConsumer } from './logs.consumer';

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
vi.mock('../logs/store', () => ({ saveLogs: vi.fn() }));

const entry = {
  level: 'error',
  message: 'Payment failed',
  source: 'api',
  timestamp: '2026-10-08T09:30:00.000Z',
};

function runBatch(values: string[]) {
  const { eachBatch } = consumer.run.mock.calls.at(-1)?.[0] as {
    eachBatch: (payload: EachBatchPayload) => Promise<void>;
  };
  return eachBatch({
    batch: { messages: values.map((value) => ({ value: Buffer.from(value) })) },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  consumer.disconnect.mockResolvedValue(undefined);
});

describe('startLogsConsumer', () => {
  it('stores each batch from the logs topic and skips malformed entries', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const stop = await startLogsConsumer();

    expect(ensureTopic).toHaveBeenCalledWith(kafka, 'logs');
    expect(kafka.consumer).toHaveBeenCalledWith({ groupId: LOGS_GROUP });
    expect(consumer.subscribe).toHaveBeenCalledWith({
      topic: 'logs',
      fromBeginning: false,
    });

    await runBatch([JSON.stringify(entry), 'garbage']);

    expect(saveLogs).toHaveBeenCalledWith([entry]);
    expect(warn).toHaveBeenCalledWith(
      'Skipped 1 malformed message(s) on logs.',
    );

    await stop();
    expect(consumer.disconnect).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('throws on a failed write so the batch is read again', async () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    vi.mocked(saveLogs).mockRejectedValueOnce(new Error('db down'));
    await startLogsConsumer();

    await expect(runBatch([JSON.stringify(entry)])).rejects.toThrow('db down');
    expect(error).toHaveBeenCalledWith("Couldn't store 1 log entries: db down");
    error.mockRestore();
  });

  it('disconnects when it can’t subscribe', async () => {
    consumer.subscribe.mockRejectedValueOnce(new Error('not authorized'));

    await expect(startLogsConsumer()).rejects.toThrow('not authorized');
    expect(consumer.disconnect).toHaveBeenCalled();
  });
});
