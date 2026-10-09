import type { EachMessagePayload } from 'kafkajs';
import { storeMessage } from '../chat/conversations';
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
vi.mock('../chat/conversations', () => ({ storeMessage: vi.fn() }));
vi.mock('../log', () => ({ log: vi.fn() }));

const envelope = {
  message: {
    id: 'd'.repeat(24),
    conversationId: 'c'.repeat(24),
    senderRole: 'user',
    senderId: 'a'.repeat(24),
    senderName: 'Amina',
    body: 'Hello',
    createdAt: '2026-10-08T09:30:00.000Z',
  },
  audience: {
    userId: 'a'.repeat(24),
    sellerId: 'b'.repeat(24),
    support: false,
  },
};

function deliverer() {
  const { eachMessage } = consumer.run.mock.calls.at(-1)?.[0] as {
    eachMessage: (payload: EachMessagePayload) => Promise<void>;
  };
  return (value: string, offset = '1') =>
    eachMessage({ message: { value: Buffer.from(value), offset } } as never);
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
  it('stores each message in the shared group and skips malformed ones', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const stop = await startPersistenceConsumer();

    expect(kafka.consumer).toHaveBeenCalledWith({
      groupId: CHAT_PERSISTENCE_GROUP,
    });
    expect(consumer.subscribe).toHaveBeenCalledWith({
      topic: 'chat_messages',
      fromBeginning: false,
    });
    const deliver = deliverer();
    await deliver(JSON.stringify(envelope));
    await deliver('nope', '2');

    expect(storeMessage).toHaveBeenCalledTimes(1);
    expect(storeMessage).toHaveBeenCalledWith(envelope.message);
    expect(warn).toHaveBeenCalledWith(
      'Skipped a malformed message on chat_messages at offset 2.',
    );

    await stop();
    expect(consumer.disconnect).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('throws on a failed write so Kafka offers the message again', async () => {
    vi.mocked(storeMessage).mockRejectedValueOnce(new Error('db down'));
    await startPersistenceConsumer();

    await expect(deliverer()(JSON.stringify(envelope))).rejects.toThrow(
      'db down',
    );
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
