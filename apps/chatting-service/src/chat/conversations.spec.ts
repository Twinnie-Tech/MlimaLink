import { getProducer } from '@org/utils/kafka';
import { prisma } from '../prisma';
import {
  SUPPORT_TITLE,
  listConversations,
  listMessages,
  openConversation,
  sendMessage,
  storeMessage,
} from './conversations';
import type { Participant } from './participants';

vi.mock('../prisma', () => ({
  prisma: {
    conversations: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    chat_messages: { findMany: vi.fn(), upsert: vi.fn() },
    shops: { findUnique: vi.fn() },
    users: { findUnique: vi.fn() },
    sellers: { findUnique: vi.fn() },
  },
}));
vi.mock('@org/utils/kafka', () => ({ getProducer: vi.fn() }));

const db = vi.mocked(prisma, { deep: true });
const producer = { send: vi.fn() };

const userId = 'a'.repeat(24);
const sellerId = 'b'.repeat(24);
const shopId = 'c'.repeat(24);
const conversationId = 'd'.repeat(24);
const adminId = 'e'.repeat(24);
const expiresAt = Date.now() + 60_000;

const shopper: Participant = {
  role: 'user',
  id: userId,
  name: 'Amina',
  expiresAt,
};
const seller: Participant = {
  role: 'seller',
  id: sellerId,
  name: 'Baraka',
  expiresAt,
};
const admin: Participant = {
  role: 'admin',
  id: adminId,
  name: 'Ops',
  expiresAt,
};

const shopRow = {
  id: conversationId,
  kind: 'shop',
  userId,
  sellerId,
  shopId,
  lastMessage: 'Hello',
  lastMessageAt: new Date('2026-10-08T09:30:00.000Z'),
  user: { name: 'Amina' },
  seller: { name: 'Baraka' },
  shop: { name: 'Baraka Crafts' },
};
const supportRow = {
  ...shopRow,
  kind: 'support',
  sellerId: null,
  shopId: null,
  seller: null,
  shop: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getProducer).mockResolvedValue(producer as never);
});

describe('listConversations', () => {
  it('shows shoppers the shop and sellers the shopper', async () => {
    db.conversations.findMany.mockResolvedValue([shopRow] as never);

    const [forShopper] = await listConversations(shopper);
    expect(db.conversations.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { userId } }),
    );
    expect(forShopper).toMatchObject({
      title: 'Baraka Crafts',
      kind: 'shop',
      lastMessageAt: '2026-10-08T09:30:00.000Z',
    });

    const [forSeller] = await listConversations(seller);
    expect(db.conversations.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { sellerId } }),
    );
    expect(forSeller.title).toBe('Amina');
  });

  it('shows admins every support chat with who started it', async () => {
    db.conversations.findMany.mockResolvedValue([supportRow] as never);

    const [chat] = await listConversations(admin);

    expect(db.conversations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { kind: 'support' } }),
    );
    expect(chat).toMatchObject({ title: 'Amina', subtitle: 'Shopper' });
  });

  it('shows shoppers and sellers support chats as MlimaLink support', async () => {
    db.conversations.findMany.mockResolvedValue([supportRow] as never);

    const [chat] = await listConversations(shopper);

    expect(chat.title).toBe(SUPPORT_TITLE);
  });
});

describe('openConversation', () => {
  beforeEach(() => {
    db.conversations.upsert.mockResolvedValue(shopRow as never);
  });

  it('opens one chat per shopper and shop', async () => {
    db.shops.findUnique.mockResolvedValue({ id: shopId, sellerId } as never);

    await openConversation(shopper, { shopId });

    expect(db.conversations.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: `shop:${shopId}:${userId}` },
        create: {
          key: `shop:${shopId}:${userId}`,
          kind: 'shop',
          userId,
          sellerId,
          shopId,
        },
        update: {},
      }),
    );
  });

  it('404s for a shop that doesn’t exist', async () => {
    db.shops.findUnique.mockResolvedValue(null);

    await expect(openConversation(shopper, { shopId })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('opens a support chat for shoppers and sellers', async () => {
    await openConversation(seller, { support: true });

    expect(db.conversations.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: `support:seller:${sellerId}` },
        create: {
          key: `support:seller:${sellerId}`,
          kind: 'support',
          sellerId,
        },
      }),
    );
  });

  it('lets admins open a support chat with a shopper', async () => {
    db.users.findUnique.mockResolvedValue({ id: userId } as never);

    await openConversation(admin, { userId });

    expect(db.conversations.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: `support:user:${userId}` } }),
    );
  });

  it('doesn’t let sellers start shop chats or admins open without a person', async () => {
    await expect(openConversation(seller, { shopId })).rejects.toMatchObject({
      status: 400,
    });
    await expect(openConversation(admin, {})).rejects.toMatchObject({
      status: 400,
    });
    expect(db.conversations.upsert).not.toHaveBeenCalled();
  });

  it('returns the chat another request created at the same time', async () => {
    db.conversations.upsert.mockRejectedValueOnce({ code: 'P2002' });
    db.conversations.findUniqueOrThrow.mockResolvedValue(supportRow as never);

    const chat = await openConversation(shopper, { support: true });

    expect(chat.kind).toBe('support');
  });
});

describe('listMessages', () => {
  it('returns the page oldest first', async () => {
    db.conversations.findUnique.mockResolvedValue(shopRow as never);
    const at = (minute: number) => new Date(`2026-10-08T09:${minute}:00.000Z`);
    db.chat_messages.findMany.mockResolvedValue([
      {
        id: '2',
        conversationId,
        senderRole: 'seller',
        senderId: sellerId,
        senderName: 'Baraka',
        body: 'Yes',
        createdAt: at(31),
      },
      {
        id: '1',
        conversationId,
        senderRole: 'user',
        senderId: userId,
        senderName: 'Amina',
        body: 'Hi',
        createdAt: at(30),
      },
    ] as never);
    const before = new Date('2026-10-08T10:00:00.000Z');

    const messages = await listMessages(shopper, conversationId, before);

    expect(db.chat_messages.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId, createdAt: { lt: before } },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(messages.map((message) => message.id)).toEqual(['1', '2']);
    expect(messages[0].createdAt).toBe('2026-10-08T09:30:00.000Z');
  });

  it('hides other people’s chats as not found', async () => {
    db.conversations.findUnique.mockResolvedValue(shopRow as never);
    const stranger: Participant = { ...shopper, id: 'f'.repeat(24) };

    await expect(listMessages(stranger, conversationId)).rejects.toMatchObject({
      status: 404,
    });
    await expect(listMessages(admin, conversationId)).rejects.toMatchObject({
      status: 404,
    });
    await expect(listMessages(shopper, 'not-an-id')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('sendMessage', () => {
  it('publishes the message to Kafka keyed by conversation', async () => {
    db.conversations.findUnique.mockResolvedValue(shopRow as never);

    const message = await sendMessage(
      seller,
      conversationId,
      '  Yes, in stock ',
    );

    expect(message).toMatchObject({
      conversationId,
      senderRole: 'seller',
      senderId: sellerId,
      senderName: 'Baraka',
      body: 'Yes, in stock',
    });
    expect(producer.send).toHaveBeenCalledWith({
      topic: 'chat_messages',
      messages: [
        {
          key: conversationId,
          value: JSON.stringify({
            message,
            audience: { userId, sellerId, support: false },
          }),
        },
      ],
    });
  });

  it('rejects empty messages before looking anything up', async () => {
    await expect(
      sendMessage(shopper, conversationId, ' '),
    ).rejects.toMatchObject({ status: 400 });
    expect(db.conversations.findUnique).not.toHaveBeenCalled();
  });

  it('answers 503 when Kafka is down', async () => {
    db.conversations.findUnique.mockResolvedValue(supportRow as never);
    vi.mocked(getProducer).mockRejectedValue(new Error('broker down'));

    await expect(
      sendMessage(admin, conversationId, 'Hi'),
    ).rejects.toMatchObject({
      status: 503,
    });
  });
});

describe('storeMessage', () => {
  it('stores the message once and updates the chat preview', async () => {
    const message = {
      id: 'f'.repeat(24),
      conversationId,
      senderRole: 'user' as const,
      senderId: userId,
      senderName: 'Amina',
      body: 'x'.repeat(300),
      createdAt: '2026-10-08T09:30:00.000Z',
    };

    await storeMessage(message);

    const createdAt = new Date(message.createdAt);
    expect(db.chat_messages.upsert).toHaveBeenCalledWith({
      where: { id: message.id },
      create: { ...message, createdAt },
      update: {},
    });
    expect(db.conversations.updateMany).toHaveBeenCalledWith({
      where: { id: conversationId },
      data: { lastMessage: 'x'.repeat(200), lastMessageAt: createdAt },
    });
  });
});
