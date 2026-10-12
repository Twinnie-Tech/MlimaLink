import type { EachBatchPayload, EachMessagePayload } from 'kafkajs';
import { storeMessages } from '../chat/conversations';
import { ChatHub } from '../chat/hub';
import {
  CHAT_PERSISTENCE_GROUP,
  deliveryGroupId,
  startDeliveryConsumer,
  startPersistenceConsumer,
} from './chat.consumers';

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
vi.mock('../chat/conversations', () => ({ storeMessages: vi.fn() }));
vi.mock('../log', () => ({ log: vi.fn() }));

const envelope = {
  message: {
    id: 'd'.repeat(24),
    conversationId: 'c'.repeat(24),
    senderRole: 'user',
    senderId: 'a'.repeat(24),
    senderName: 'Amina',
    body: 'Hello',
    attachments: [],
    createdAt: '2026-10-08T09:30:00.000Z',
  },
  audience: {
    userId: 'a'.repeat(24),
    sellerId: 'b'.repeat(24),
    support: false,
  },
};

const runConfig = () => consumer.run.mock.calls.at(-1)?.[0];

function deliverer() {
  const { eachMessage } = runConfig() as {
    eachMessage: (payload: EachMessagePayload) => Promise<void>;
  };
  return (value: string, offset = '1') =>
    eachMessage({ message: { value: Buffer.from(value), offset } } as never);
}

function batchOf(values: string[], stale = false) {
  const messages = values.map((value, index) => ({
    value: Buffer.from(value),
    offset: String(index + 10),
  }));
  const payload = {
    batch: {
      partition: 3,
      messages,
      firstOffset: () => messages[0]?.offset ?? null,
      lastOffset: () => messages.at(-1)?.offset ?? '9',
    },
    resolveOffset: vi.fn(),
    heartbeat: vi.fn(),
    isStale: () => stale,
  };
  const { eachBatch } = runConfig() as {
    eachBatch: (payload: EachBatchPayload) => Promise<void>;
  };
  return { payload, run: () => eachBatch(payload as never) };
}

beforeEach(() => {
  vi.clearAllMocks();
  consumer.disconnect.mockResolvedValue(undefined);
});

describe('deliveryGroupId', () => {
  it('gives each instance its own group', () => {
    expect(deliveryGroupId('chat-1')).toBe('chat-delivery-chat-1');
    expect(deliveryGroupId('')).toMatch(/^chat-delivery-.+-\d+$/);
  });
});

describe('startPersistenceConsumer', () => {
  it('stores each batch in one write, skipping malformed messages, then commits', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const stop = await startPersistenceConsumer();

    expect(kafka.consumer).toHaveBeenCalledWith({
      groupId: CHAT_PERSISTENCE_GROUP,
    });
    expect(consumer.subscribe).toHaveBeenCalledWith({
      topic: 'chat_messages',
      fromBeginning: false,
    });
    expect(runConfig()).toMatchObject({ eachBatchAutoResolve: false });

    const second = {
      ...envelope,
      message: { ...envelope.message, id: 'e'.repeat(24) },
    };
    const { payload, run } = batchOf([
      JSON.stringify(envelope),
      'nope',
      JSON.stringify(second),
    ]);
    await run();

    expect(storeMessages).toHaveBeenCalledTimes(1);
    expect(storeMessages).toHaveBeenCalledWith([
      envelope.message,
      second.message,
    ]);
    expect(warn).toHaveBeenCalledWith(
      'Skipped a malformed message on chat_messages at offset 11.',
    );
    expect(payload.resolveOffset).toHaveBeenCalledWith('12');
    expect(payload.heartbeat).toHaveBeenCalled();

    await stop();
    expect(consumer.disconnect).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('throws on a failed write without committing, so Kafka offers the batch again', async () => {
    vi.mocked(storeMessages).mockRejectedValueOnce(new Error('db down'));
    await startPersistenceConsumer();

    const { payload, run } = batchOf([JSON.stringify(envelope)]);
    await expect(run()).rejects.toThrow('db down');
    expect(payload.resolveOffset).not.toHaveBeenCalled();
  });

  it('skips a batch that went stale after a rebalance', async () => {
    await startPersistenceConsumer();

    const { payload, run } = batchOf([JSON.stringify(envelope)], true);
    await run();

    expect(storeMessages).not.toHaveBeenCalled();
    expect(payload.resolveOffset).not.toHaveBeenCalled();
  });
});

describe('startDeliveryConsumer', () => {
  it('passes each message to the hub', async () => {
    const hub = new ChatHub();
    const deliver = vi.spyOn(hub, 'deliver');
    await startDeliveryConsumer(hub);

    expect(kafka.consumer).toHaveBeenCalledWith({
      groupId: expect.stringMatching(/^chat-delivery-/),
    });
    await deliverer()(JSON.stringify(envelope));

    expect(deliver).toHaveBeenCalledWith(envelope);
  });

  it('disconnects when it can’t subscribe', async () => {
    consumer.subscribe.mockRejectedValueOnce(new Error('not authorized'));

    await expect(startDeliveryConsumer(new ChatHub())).rejects.toThrow(
      'not authorized',
    );
    expect(consumer.disconnect).toHaveBeenCalled();
  });
});
