import { getProducer } from '@org/utils/kafka';
import { prisma } from '../prisma';
import {
  SUPPORT_TITLE,
  listConversations,
  listMessages,
  openConversation,
  previewOf,
  sendMessage,
  storeMessages,
} from './conversations';
import type { Participant } from './participants';
import type { ChatMessage } from './protocol';

const limiter = vi.hoisted(() => ({ take: vi.fn() }));

vi.mock('../prisma', () => ({
  prisma: {
    conversations: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    chat_messages: { findMany: vi.fn(), createMany: vi.fn() },
    shops: { findUnique: vi.fn() },
    users: { findUnique: vi.fn(), findMany: vi.fn() },
    sellers: { findUnique: vi.fn(), findMany: vi.fn() },
    admins: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock('@org/utils/kafka', () => ({ getProducer: vi.fn() }));
vi.mock('../log', () => ({ log: vi.fn() }));
vi.mock('./rate-limit', () => ({ messageLimiter: () => limiter }));

const db = vi.mocked(prisma, { deep: true });
const producer = { send: vi.fn() };

const userId = 'a'.repeat(24);
const sellerId = 'b'.repeat(24);
const shopId = 'c'.repeat(24);
const conversationId = 'd'.repeat(24);
const adminId = 'e'.repeat(24);
const otherUserId = 'f'.repeat(24);
const expiresAt = Date.now() + 60_000;
const endpoint = 'https://ik.imagekit.io/mlima';

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
  participantKeys: [],
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
const directKeys = [`seller:${sellerId}`, `user:${userId}`];
const directRow = {
  ...shopRow,
  kind: 'direct',
  userId: null,
  sellerId: null,
  shopId: null,
  participantKeys: directKeys,
  user: null,
  seller: null,
  shop: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('IMAGEKIT_URL_ENDPOINT', endpoint);
  vi.mocked(getProducer).mockResolvedValue(producer as never);
  limiter.take.mockResolvedValue(true);
  db.users.findMany.mockResolvedValue([{ id: userId, name: 'Amina' }] as never);
  db.sellers.findMany.mockResolvedValue([
    { id: sellerId, name: 'Baraka' },
  ] as never);
  db.admins.findMany.mockResolvedValue([] as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('listConversations', () => {
  const ownDirect = (key: string) => ({ participantKeys: { has: key } });

  it('shows shoppers the shop and sellers the shopper', async () => {
    db.conversations.findMany.mockResolvedValue([shopRow] as never);

    const [forShopper] = await listConversations(shopper);
    expect(db.conversations.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { OR: [{ userId }, ownDirect(`user:${userId}`)] },
      }),
    );
    expect(forShopper).toMatchObject({
      title: 'Baraka Crafts',
      kind: 'shop',
      counterpart: null,
      lastMessageAt: '2026-10-08T09:30:00.000Z',
    });

    const [forSeller] = await listConversations(seller);
    expect(db.conversations.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { OR: [{ sellerId }, ownDirect(`seller:${sellerId}`)] },
      }),
    );
    expect(forSeller.title).toBe('Amina');
  });

  it('shows admins every support chat with who started it', async () => {
    db.conversations.findMany.mockResolvedValue([supportRow] as never);

    const [chat] = await listConversations(admin);

    expect(db.conversations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ kind: 'support' }, ownDirect(`admin:${adminId}`)] },
      }),
    );
    expect(chat).toMatchObject({ title: 'Amina', subtitle: 'Shopper' });
  });

  it('shows shoppers and sellers support chats as MlimaLink support', async () => {
    db.conversations.findMany.mockResolvedValue([supportRow] as never);

    const [chat] = await listConversations(shopper);

    expect(chat.title).toBe(SUPPORT_TITLE);
  });

  it('names the other person in direct chats, looking names up together', async () => {
    db.conversations.findMany.mockResolvedValue([directRow] as never);

    const [forShopper] = await listConversations(shopper);
    expect(forShopper).toMatchObject({
      kind: 'direct',
      title: 'Baraka',
      subtitle: 'Seller',
      counterpart: { role: 'seller', id: sellerId },
    });
    expect(db.sellers.findMany).toHaveBeenCalledWith({
      where: { id: { in: [sellerId] } },
      select: { id: true, name: true },
    });
    expect(db.users.findMany).not.toHaveBeenCalled();

    const [forSeller] = await listConversations(seller);
    expect(forSeller).toMatchObject({ title: 'Amina', subtitle: 'Shopper' });
  });
});

describe('openConversation', () => {
  beforeEach(() => {
    db.conversations.upsert.mockResolvedValue(shopRow as never);
  });

  it('opens one direct chat per pair, whoever starts it', async () => {
    db.conversations.upsert.mockResolvedValue(directRow as never);
    db.sellers.findUnique.mockResolvedValue({
      name: 'Baraka',
      suspended: false,
    } as never);
    db.users.findUnique.mockResolvedValue({
      name: 'Amina',
      suspended: false,
    } as never);
    const key = `direct:${directKeys.join('|')}`;

    const chat = await openConversation(shopper, {
      to: { role: 'seller', id: sellerId },
    });
    await openConversation(seller, { to: { role: 'user', id: userId } });

    for (const call of db.conversations.upsert.mock.calls) {
      expect(call[0]).toMatchObject({
        where: { key },
        create: { key, kind: 'direct', participantKeys: directKeys },
      });
    }
    expect(chat).toMatchObject({ kind: 'direct', title: 'Baraka' });
  });

  it('lets admins message anyone directly', async () => {
    db.users.findUnique.mockResolvedValue({
      name: 'Zawadi',
      suspended: false,
    } as never);

    await openConversation(admin, { to: { role: 'user', id: otherUserId } });

    expect(db.conversations.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          participantKeys: [`admin:${adminId}`, `user:${otherUserId}`],
        }),
      }),
    );
  });

  it('refuses to message yourself, nobody, or a suspended account', async () => {
    await expect(
      openConversation(shopper, { to: { role: 'user', id: userId } }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      openConversation(shopper, { to: { role: 'rider', id: sellerId } }),
    ).rejects.toMatchObject({ status: 400 });

    db.sellers.findUnique.mockResolvedValue({
      name: 'Baraka',
      suspended: true,
    } as never);
    await expect(
      openConversation(shopper, { to: { role: 'seller', id: sellerId } }),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.conversations.upsert).not.toHaveBeenCalled();
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
        body: '',
        attachments: [`${endpoint}/chat/seller-${sellerId}/a.jpg`],
        createdAt: at(31),
      },
      {
        id: '1',
        conversationId,
        senderRole: 'user',
        senderId: userId,
        senderName: 'Amina',
        body: 'Hi',
        attachments: [],
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
    expect(messages[1].attachments).toHaveLength(1);
  });

  it('hides other people’s chats as not found', async () => {
    db.conversations.findUnique.mockResolvedValue(shopRow as never);
    const stranger: Participant = { ...shopper, id: otherUserId };

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

  it('only lets the two people in a direct chat read it', async () => {
    db.conversations.findUnique.mockResolvedValue(directRow as never);
    db.chat_messages.findMany.mockResolvedValue([] as never);

    await expect(listMessages(seller, conversationId)).resolves.toEqual([]);
    await expect(listMessages(admin, conversationId)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      listMessages({ ...shopper, id: otherUserId }, conversationId),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('sendMessage', () => {
  it('publishes the message to Kafka keyed by conversation', async () => {
    db.conversations.findUnique.mockResolvedValue(shopRow as never);

    const message = await sendMessage(seller, conversationId, {
      body: '  Yes, in stock ',
    });

    expect(message).toMatchObject({
      conversationId,
      senderRole: 'seller',
      senderId: sellerId,
      senderName: 'Baraka',
      body: 'Yes, in stock',
      attachments: [],
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
    expect(limiter.take).toHaveBeenCalledWith(`seller:${sellerId}`);
  });

  it('sends direct chat messages to both people, with the sender’s photos', async () => {
    db.conversations.findUnique.mockResolvedValue(directRow as never);
    const photo = `${endpoint}/chat/user-${userId}/shoes_x1.jpg`;

    const message = await sendMessage(shopper, conversationId, {
      attachments: [photo],
    });

    expect(message).toMatchObject({ body: '', attachments: [photo] });
    const [{ value }] = producer.send.mock.calls[0][0].messages;
    expect(JSON.parse(value).audience).toEqual({
      participants: directKeys,
      support: false,
    });
  });

  it('rejects photos that aren’t in the sender’s chat folder', async () => {
    for (const url of [
      `${endpoint}/chat/user-${otherUserId}/a.jpg`,
      `${endpoint}/products/${shopId}/a.jpg`,
      `https://evil.example/chat/user-${userId}/a.jpg`,
      `${endpoint}/chat/user-${userId}/../user-${otherUserId}/a.jpg`,
    ]) {
      await expect(
        sendMessage(shopper, conversationId, { attachments: [url] }),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(db.conversations.findUnique).not.toHaveBeenCalled();
  });

  it('rejects empty messages before looking anything up', async () => {
    await expect(
      sendMessage(shopper, conversationId, { body: ' ' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(limiter.take).not.toHaveBeenCalled();
    expect(db.conversations.findUnique).not.toHaveBeenCalled();
  });

  it('answers 429 when the sender is over their limit', async () => {
    limiter.take.mockResolvedValue(false);

    await expect(
      sendMessage(shopper, conversationId, { body: 'Hi' }),
    ).rejects.toMatchObject({ status: 429 });
    expect(producer.send).not.toHaveBeenCalled();
  });

  it('answers 503 when Kafka is down', async () => {
    db.conversations.findUnique.mockResolvedValue(supportRow as never);
    vi.mocked(getProducer).mockRejectedValue(new Error('broker down'));

    await expect(
      sendMessage(admin, conversationId, { body: 'Hi' }),
    ).rejects.toMatchObject({
      status: 503,
    });
  });
});

describe('previewOf', () => {
  const base = { body: '', attachments: [] } as unknown as ChatMessage;

  it('shows the text, or says how many photos were sent', () => {
    expect(previewOf({ ...base, body: 'x'.repeat(300) })).toBe('x'.repeat(200));
    expect(previewOf({ ...base, attachments: ['a'] })).toBe('Sent a photo');
    expect(previewOf({ ...base, attachments: ['a', 'b'] })).toBe(
      'Sent 2 photos',
    );
  });
});

describe('storeMessages', () => {
  const otherChat = '9'.repeat(24);
  const message = (
    id: string,
    minute: number,
    chat = conversationId,
  ): ChatMessage => ({
    id: id.repeat(24),
    conversationId: chat,
    senderRole: 'user',
    senderId: userId,
    senderName: 'Amina',
    body: `message ${id}`,
    attachments: [],
    createdAt: `2026-10-08T09:${minute}:00.000Z`,
  });

  it('inserts new messages together and updates each chat’s preview once', async () => {
    const first = message('1', 30);
    const second = message('2', 31);
    const elsewhere = message('3', 32, otherChat);
    db.chat_messages.findMany.mockResolvedValue([{ id: first.id }] as never);

    await storeMessages([first, second, second, elsewhere]);

    expect(db.chat_messages.findMany).toHaveBeenCalledWith({
      where: { id: { in: [first.id, second.id, elsewhere.id] } },
      select: { id: true },
    });
    expect(db.chat_messages.createMany).toHaveBeenCalledTimes(1);
    expect(db.chat_messages.createMany).toHaveBeenCalledWith({
      data: [second, elsewhere].map((m) => ({
        ...m,
        createdAt: new Date(m.createdAt),
      })),
    });

    expect(db.conversations.updateMany).toHaveBeenCalledTimes(2);
    const latestAt = new Date(second.createdAt);
    expect(db.conversations.updateMany).toHaveBeenCalledWith({
      where: {
        id: conversationId,
        OR: [
          { lastMessageAt: { isSet: false } },
          { lastMessageAt: null },
          { lastMessageAt: { lte: latestAt } },
        ],
      },
      data: { lastMessage: 'message 2', lastMessageAt: latestAt },
    });
  });

  it('only updates previews when the whole batch was stored before', async () => {
    const first = message('1', 30);
    db.chat_messages.findMany.mockResolvedValue([{ id: first.id }] as never);

    await storeMessages([first]);

    expect(db.chat_messages.createMany).not.toHaveBeenCalled();
    expect(db.conversations.updateMany).toHaveBeenCalledTimes(1);
  });

  it('does nothing for an empty batch', async () => {
    await storeMessages([]);

    expect(db.chat_messages.findMany).not.toHaveBeenCalled();
  });
});
