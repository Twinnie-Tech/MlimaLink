import { getProducer } from '@org/utils/kafka';
import { prisma } from '../prisma';
import {
  SUPPORT_TITLE,
  UNSEEN_CAP,
  announceTyping,
  countUnseen,
  counterpartKeys,
  deleteMessage,
  deliverLocallyWith,
  editMessage,
  getConversation,
  listConversations,
  listMessages,
  markRead,
  openConversation,
  previewOf,
  reactToMessage,
  sendMessage,
  storeMessages,
} from './conversations';
import type { Participant } from './participants';
import type { ChatMessage } from './protocol';

const limiter = vi.hoisted(() => ({ take: vi.fn() }));
const presence = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../prisma', () => ({
  prisma: {
    conversations: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    chat_messages: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    conversation_reads: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    shops: { findUnique: vi.fn() },
    users: { findUnique: vi.fn(), findMany: vi.fn() },
    sellers: { findUnique: vi.fn(), findMany: vi.fn() },
    admins: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock('@org/utils/kafka', () => ({ getProducer: vi.fn() }));
vi.mock('../log', () => ({ log: vi.fn() }));
vi.mock('./rate-limit', () => ({ messageLimiter: () => limiter }));
vi.mock('./presence', () => ({ presenceStore: () => presence }));

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
const storedRow = (id: string, senderRole = 'user', senderId = userId) => ({
  id,
  conversationId,
  senderRole,
  senderId,
  senderName: senderRole === 'user' ? 'Amina' : 'Baraka',
  body: 'Hello',
  attachments: [] as string[],
  files: [],
  gif: null,
  replyTo: null,
  reactions: [] as { emoji: string; key: string; name: string }[],
  editedAt: null,
  deletedAt: null as Date | null,
  createdAt: new Date('2026-10-08T09:30:00.000Z'),
});

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
  db.conversation_reads.findMany.mockResolvedValue([] as never);
  db.conversation_reads.updateMany.mockResolvedValue({ count: 1 } as never);
  db.chat_messages.count.mockResolvedValue(0 as never);
  presence.get.mockResolvedValue(new Map());
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
      participants: [
        { role: 'user', id: userId },
        { role: 'seller', id: sellerId },
      ],
      counterpart: { role: 'seller', id: sellerId },
      presence: { status: 'offline', lastSeenAt: null },
      lastMessageAt: '2026-10-08T09:30:00.000Z',
    });
    // Shop chats are titled with the shop's name, so no names are looked up.
    expect(db.sellers.findMany).not.toHaveBeenCalled();

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

    expect(chat).toMatchObject({
      title: SUPPORT_TITLE,
      counterpart: null,
      presence: null,
    });
  });

  it('shows whether the other person is online', async () => {
    const lastSeenAt = '2026-10-08T09:59:00.000Z';
    presence.get.mockResolvedValue(
      new Map([[`seller:${sellerId}`, { status: 'away', lastSeenAt }]]),
    );
    db.conversations.findMany.mockResolvedValue([shopRow, directRow] as never);

    const chats = await listConversations(shopper);

    expect(presence.get).toHaveBeenCalledWith([`seller:${sellerId}`]);
    expect(chats.map((chat) => chat.presence)).toEqual([
      { status: 'away', lastSeenAt },
      { status: 'away', lastSeenAt },
    ]);
  });

  it('still lists chats when presence can’t be read', async () => {
    presence.get.mockRejectedValue(new Error('redis down'));
    db.conversations.findMany.mockResolvedValue([shopRow] as never);

    const [chat] = await listConversations(shopper);

    expect(chat.presence).toEqual({ status: 'offline', lastSeenAt: null });
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

describe('counterpartKeys', () => {
  it('lists the people the viewer talks to, once each', async () => {
    db.conversations.findMany.mockResolvedValue([
      shopRow,
      supportRow,
      { ...directRow, participantKeys: [`admin:${adminId}`, `user:${userId}`] },
      { ...shopRow, id: 'x'.repeat(24) },
    ] as never);

    await expect(counterpartKeys(shopper)).resolves.toEqual([
      `seller:${sellerId}`,
      `admin:${adminId}`,
    ]);
    expect(db.conversations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50, orderBy: { updatedAt: 'desc' } }),
    );
  });

  it('gives admins the shoppers and sellers in support chats', async () => {
    db.conversations.findMany.mockResolvedValue([supportRow] as never);

    await expect(counterpartKeys(admin)).resolves.toEqual([`user:${userId}`]);
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
    db.sellers.findUnique.mockResolvedValue({
      name: 'Baraka',
      suspended: false,
    } as never);

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

  it('404s for a shop that doesn’t exist or whose seller is suspended', async () => {
    db.shops.findUnique.mockResolvedValue(null);
    await expect(openConversation(shopper, { shopId })).rejects.toMatchObject({
      status: 404,
    });

    db.shops.findUnique.mockResolvedValue({ id: shopId, sellerId } as never);
    db.sellers.findUnique.mockResolvedValue({
      name: 'Baraka',
      suspended: true,
    } as never);
    await expect(openConversation(shopper, { shopId })).rejects.toMatchObject({
      status: 404,
      message: 'That shop isn’t taking messages right now.',
    });
    expect(db.conversations.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['nothing', shopper, {}],
    ['two choices at once', shopper, { shopId: 'c'.repeat(24), support: true }],
    ['a body that isn’t an object', shopper, ['support']],
    ['support that isn’t true', shopper, { support: 'yes' }],
    ['a malformed shop id', shopper, { shopId: 'abc' }],
    ['a shopper using admin options', shopper, { userId: 'a'.repeat(24) }],
    ['an admin asking support', { role: 'admin' }, { support: true }],
    ['an admin with a malformed id', { role: 'admin' }, { sellerId: 'x' }],
  ])('rejects %s with 400', async (_case, who, input) => {
    const viewer = { ...shopper, ...who } as Participant;

    await expect(openConversation(viewer, input)).rejects.toMatchObject({
      status: 400,
    });
    expect(db.conversations.upsert).not.toHaveBeenCalled();
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

describe('getConversation', () => {
  it('returns one chat the viewer is in', async () => {
    db.conversations.findUnique.mockResolvedValue(shopRow as never);

    await expect(
      getConversation(seller, conversationId),
    ).resolves.toMatchObject({
      id: conversationId,
      title: 'Amina',
      counterpart: { role: 'user', id: userId },
    });
  });

  it('hides chats the viewer isn’t in', async () => {
    db.conversations.findUnique.mockResolvedValue(shopRow as never);

    await expect(
      getConversation({ ...seller, id: 'f'.repeat(24) }, conversationId),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('listMessages', () => {
  const at = (minute: number) => new Date(`2026-10-08T09:${minute}:00.000Z`);
  const row = (id: string, minute: number) => ({
    id: id.repeat(24),
    conversationId,
    senderRole: 'seller',
    senderId: sellerId,
    senderName: 'Baraka',
    body: `message ${id}`,
    attachments: [],
    createdAt: at(minute),
  });

  it('returns the latest page newest first and clears the unseen count', async () => {
    db.conversations.findUnique.mockResolvedValue(shopRow as never);
    db.chat_messages.findMany.mockResolvedValue([
      row('3', 32),
      row('2', 31),
      row('1', 30),
    ] as never);

    const page = await listMessages(shopper, conversationId, { limit: 2 });

    expect(db.chat_messages.findMany).toHaveBeenCalledWith({
      where: { conversationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 3,
    });
    expect(page.messages.map((message) => message.body)).toEqual([
      'message 3',
      'message 2',
    ]);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe('2'.repeat(24));
    expect(page.messages[0].createdAt).toBe('2026-10-08T09:32:00.000Z');

    expect(page.lastReadAt).not.toBeNull();
    expect(db.conversation_reads.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId,
          participant: `user:${userId}`,
        }),
      }),
    );
  });

  it('announces the read for seen receipts and says how far the other side has read', async () => {
    db.conversations.findUnique.mockResolvedValue(shopRow as never);
    db.chat_messages.findMany.mockResolvedValue([row('1', 30)] as never);
    const seenAt = new Date('2026-10-08T09:31:00.000Z');
    db.conversation_reads.findMany.mockResolvedValue([
      { lastReadAt: seenAt },
    ] as never);

    const page = await listMessages(shopper, conversationId);

    expect(page.seenAt).toBe(seenAt.toISOString());
    expect(db.conversation_reads.findMany).toHaveBeenCalledWith({
      where: { conversationId, participant: `seller:${sellerId}` },
      select: { lastReadAt: true },
      orderBy: { lastReadAt: 'desc' },
      take: 1,
    });
    const [{ value }] = producer.send.mock.calls[0][0].messages;
    expect(JSON.parse(value)).toEqual({
      type: 'seen',
      conversationId,
      reader: `user:${userId}`,
      lastReadAt: page.lastReadAt,
      audience: { userId, sellerId, support: false },
    });
  });

  it('counts any admin’s read as seen for shoppers in support chats', async () => {
    db.conversations.findUnique.mockResolvedValue(supportRow as never);
    db.chat_messages.findMany.mockResolvedValue([] as never);

    const page = await listMessages(shopper, conversationId);

    expect(page.seenAt).toBeNull();
    expect(db.conversation_reads.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId, participant: { startsWith: 'admin:' } },
      }),
    );
  });

  it('pages older messages from a cursor without touching the read position', async () => {
    db.conversations.findUnique.mockResolvedValue(shopRow as never);
    const cursor = '2'.repeat(24);
    db.chat_messages.findFirst.mockResolvedValue({
      id: cursor,
      createdAt: at(31),
    } as never);
    db.chat_messages.findMany.mockResolvedValue([row('1', 30)] as never);

    const page = await listMessages(shopper, conversationId, { cursor });

    expect(db.chat_messages.findFirst).toHaveBeenCalledWith({
      where: { id: cursor, conversationId },
      select: { id: true, createdAt: true },
    });
    expect(db.chat_messages.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          conversationId,
          OR: [
            { createdAt: { lt: at(31) } },
            { createdAt: at(31), id: { lt: cursor } },
          ],
        },
        take: 21,
      }),
    );
    expect(page).toMatchObject({
      hasMore: false,
      nextCursor: null,
      lastReadAt: null,
    });
    expect(db.conversation_reads.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a cursor from another chat', async () => {
    db.conversations.findUnique.mockResolvedValue(shopRow as never);
    db.chat_messages.findFirst.mockResolvedValue(null);

    await expect(
      listMessages(shopper, conversationId, { cursor: '9'.repeat(24) }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      listMessages(shopper, conversationId, { cursor: 'nope' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('still returns messages when marking the chat read fails', async () => {
    db.conversations.findUnique.mockResolvedValue(shopRow as never);
    db.chat_messages.findMany.mockResolvedValue([row('1', 30)] as never);
    db.conversation_reads.updateMany.mockRejectedValue(new Error('db down'));

    const page = await listMessages(shopper, conversationId);

    expect(page.messages).toHaveLength(1);
    expect(page.lastReadAt).toBeNull();
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

    await expect(listMessages(seller, conversationId)).resolves.toMatchObject({
      messages: [],
    });
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
      files: [],
      gif: null,
      replyTo: null,
      reactions: [],
      editedAt: null,
      deletedAt: null,
    });
    expect(producer.send).toHaveBeenCalledWith({
      topic: 'chat_messages',
      messages: [
        {
          key: conversationId,
          value: JSON.stringify({
            type: 'message',
            message,
            audience: { userId, sellerId, support: false },
          }),
        },
      ],
    });
    expect(limiter.take).toHaveBeenCalledWith(`seller:${sellerId}`);
  });

  it('sends the sender’s documents and GIPHY GIFs', async () => {
    db.conversations.findUnique.mockResolvedValue(shopRow as never);
    const file = {
      url: `${endpoint}/chat/user-${userId}/invoice_x1.pdf`,
      name: 'invoice.pdf',
      size: 2048,
      mimeType: 'application/pdf',
    };
    const gif = {
      kind: 'sticker' as const,
      url: 'https://media2.giphy.com/media/abc/200.gif',
      width: 200,
      height: 200,
      title: 'Wave',
    };

    await expect(
      sendMessage(shopper, conversationId, { body: 'Invoice', files: [file] }),
    ).resolves.toMatchObject({ body: 'Invoice', files: [file] });
    await expect(
      sendMessage(shopper, conversationId, { gif }),
    ).resolves.toMatchObject({ body: '', gif });

    await expect(
      sendMessage(shopper, conversationId, {
        files: [{ ...file, url: `${endpoint}/chat/user-${otherUserId}/a.pdf` }],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('quotes the message being replied to, from the same chat', async () => {
    db.conversations.findUnique.mockResolvedValue(shopRow as never);
    const quotedId = '7'.repeat(24);
    db.chat_messages.findFirst.mockResolvedValue({
      ...storedRow(quotedId),
      body: 'x'.repeat(300),
    } as never);

    const message = await sendMessage(seller, conversationId, {
      body: 'Yes',
      replyToId: quotedId,
    });

    expect(db.chat_messages.findFirst).toHaveBeenCalledWith({
      where: { id: quotedId, conversationId },
    });
    expect(message.replyTo).toEqual({
      id: quotedId,
      senderName: 'Amina',
      preview: 'x'.repeat(140),
    });
  });

  it('won’t reply to a deleted or missing message, or a malformed id', async () => {
    db.conversations.findUnique.mockResolvedValue(shopRow as never);
    await expect(
      sendMessage(seller, conversationId, { body: 'Yes', replyToId: 'nope' }),
    ).rejects.toMatchObject({ status: 400 });

    db.chat_messages.findFirst.mockResolvedValue(null);
    await expect(
      sendMessage(seller, conversationId, {
        body: 'Yes',
        replyToId: '7'.repeat(24),
      }),
    ).rejects.toMatchObject({ status: 400 });

    db.chat_messages.findFirst.mockResolvedValue({
      ...storedRow('7'.repeat(24)),
      deletedAt: new Date(),
    } as never);
    await expect(
      sendMessage(seller, conversationId, {
        body: 'Yes',
        replyToId: '7'.repeat(24),
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'The message you’re replying to isn’t available any more.',
    });
    expect(producer.send).not.toHaveBeenCalled();
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
    expect(db.conversation_reads.updateMany).not.toHaveBeenCalled();
  });

  it('marks the chat read for the sender', async () => {
    db.conversations.findUnique.mockResolvedValue(shopRow as never);

    const message = await sendMessage(seller, conversationId, { body: 'Hi' });

    const at = new Date(message.createdAt);
    expect(db.conversation_reads.updateMany).toHaveBeenCalledWith({
      where: {
        conversationId,
        participant: `seller:${sellerId}`,
        lastReadAt: { lt: at },
      },
      data: { lastReadAt: at },
    });
  });

  it('still sends when marking the chat read fails', async () => {
    db.conversations.findUnique.mockResolvedValue(shopRow as never);
    db.conversation_reads.updateMany.mockRejectedValue(new Error('db down'));

    await expect(
      sendMessage(seller, conversationId, { body: 'Hi' }),
    ).resolves.toMatchObject({ body: 'Hi' });
    expect(producer.send).toHaveBeenCalled();
  });
});

describe('unseen counts', () => {
  const readAt = new Date('2026-10-08T09:00:00.000Z');
  const quietChat = '1'.repeat(24);
  const newChat = '2'.repeat(24);

  it('counts messages from others since the viewer last read each chat', async () => {
    db.conversations.findMany.mockResolvedValue([
      shopRow,
      { ...shopRow, id: quietChat, lastMessageAt: readAt },
      { ...shopRow, id: newChat },
      { ...shopRow, id: '3'.repeat(24), lastMessageAt: null },
    ] as never);
    db.conversation_reads.findMany.mockResolvedValue([
      { conversationId, lastReadAt: readAt },
      { conversationId: quietChat, lastReadAt: readAt },
    ] as never);
    db.chat_messages.count.mockImplementation((async (args: {
      where: { conversationId: string };
    }) => (args.where.conversationId === conversationId ? 3 : 7)) as never);

    const chats = await listConversations(shopper);

    expect(chats.map((chat) => chat.unseenCount)).toEqual([3, 0, 7, 0]);
    expect(db.conversation_reads.findMany).toHaveBeenCalledWith({
      where: {
        participant: `user:${userId}`,
        conversationId: { in: [conversationId, quietChat, newChat] },
      },
      select: { conversationId: true, lastReadAt: true },
    });
    // Nothing newer than the read position, and no messages at all, aren't counted.
    expect(db.chat_messages.count).toHaveBeenCalledTimes(2);
    expect(db.chat_messages.count).toHaveBeenCalledWith({
      where: {
        conversationId,
        createdAt: { gt: readAt },
        NOT: { senderRole: 'user', senderId: userId },
      },
      take: UNSEEN_CAP,
    });
    // Never opened: everything from others counts.
    expect(db.chat_messages.count).toHaveBeenCalledWith({
      where: {
        conversationId: newChat,
        NOT: { senderRole: 'user', senderId: userId },
      },
      take: UNSEEN_CAP,
    });
  });

  it('gives every admin their own count for a support chat', async () => {
    db.conversations.findMany.mockResolvedValue([supportRow] as never);

    await listConversations(admin);

    expect(db.conversation_reads.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ participant: `admin:${adminId}` }),
      }),
    );
  });

  it('totals unseen messages across the viewer’s chats for a badge', async () => {
    db.conversations.findMany.mockResolvedValue([
      { id: conversationId, lastMessageAt: readAt },
      { id: newChat, lastMessageAt: readAt },
    ] as never);
    db.chat_messages.count.mockResolvedValue(4 as never);

    await expect(countUnseen(seller)).resolves.toEqual({ total: 8 });
    expect(db.conversations.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, lastMessageAt: true },
        where: {
          OR: [
            { sellerId },
            { participantKeys: { has: `seller:${sellerId}` } },
          ],
        },
      }),
    );

    db.chat_messages.count.mockResolvedValue(UNSEEN_CAP as never);
    await expect(countUnseen(seller)).resolves.toEqual({ total: UNSEEN_CAP });
  });
});

describe('markRead', () => {
  it('moves the viewer’s read position forward', async () => {
    db.conversations.findUnique.mockResolvedValue(directRow as never);

    const read = await markRead(seller, conversationId);

    const at = new Date(read.lastReadAt);
    expect(read.conversationId).toBe(conversationId);
    expect(db.conversation_reads.updateMany).toHaveBeenCalledWith({
      where: {
        conversationId,
        participant: `seller:${sellerId}`,
        lastReadAt: { lt: at },
      },
      data: { lastReadAt: at },
    });
    expect(db.conversation_reads.create).not.toHaveBeenCalled();
    const [{ value }] = producer.send.mock.calls[0][0].messages;
    expect(JSON.parse(value)).toMatchObject({
      type: 'seen',
      reader: `seller:${sellerId}`,
      lastReadAt: read.lastReadAt,
      audience: { participants: directKeys },
    });
  });

  it('still marks the chat read when the receipt can’t be sent', async () => {
    db.conversations.findUnique.mockResolvedValue(shopRow as never);
    vi.mocked(getProducer).mockRejectedValue(new Error('broker down'));

    await expect(markRead(shopper, conversationId)).resolves.toBeDefined();
    expect(db.conversation_reads.updateMany).toHaveBeenCalled();
  });

  it('creates the read position the first time', async () => {
    db.conversations.findUnique.mockResolvedValue(supportRow as never);
    db.conversation_reads.updateMany.mockResolvedValue({ count: 0 } as never);

    const read = await markRead(admin, conversationId);

    expect(db.conversation_reads.create).toHaveBeenCalledWith({
      data: {
        conversationId,
        participant: `admin:${adminId}`,
        lastReadAt: new Date(read.lastReadAt),
      },
    });
  });

  it('leaves a newer read position alone', async () => {
    db.conversations.findUnique.mockResolvedValue(shopRow as never);
    db.conversation_reads.updateMany.mockResolvedValue({ count: 0 } as never);
    db.conversation_reads.create.mockRejectedValue({ code: 'P2002' });

    await expect(markRead(shopper, conversationId)).resolves.toBeDefined();
  });

  it('hides chats the viewer isn’t in', async () => {
    db.conversations.findUnique.mockResolvedValue(directRow as never);

    await expect(markRead(admin, conversationId)).rejects.toMatchObject({
      status: 404,
    });
    expect(db.conversation_reads.updateMany).not.toHaveBeenCalled();
  });
});

describe('previewOf', () => {
  const base = {
    body: '',
    attachments: [],
    files: [],
    gif: null,
    deletedAt: null,
  } as unknown as ChatMessage;

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
    files: [],
    gif: null,
    replyTo: null,
    reactions: [],
    editedAt: null,
    deletedAt: null,
    createdAt: `2026-10-08T09:${minute}:00.000Z`,
  });
  const stored = (m: ChatMessage) => ({
    id: m.id,
    conversationId: m.conversationId,
    senderRole: m.senderRole,
    senderId: m.senderId,
    senderName: m.senderName,
    body: m.body,
    attachments: m.attachments,
    files: m.files,
    reactions: [],
    createdAt: new Date(m.createdAt),
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
      data: [second, elsewhere].map(stored),
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

  it('stores a GIF and the quoted message only when the message has them', async () => {
    const gif = {
      kind: 'gif' as const,
      url: 'https://media.giphy.com/media/abc/200.gif',
      width: 200,
      height: 150,
      title: 'Dance',
    };
    const replyTo = { id: '7'.repeat(24), senderName: 'Baraka', preview: 'Hi' };
    const reply = { ...message('1', 30), body: '', gif, replyTo };
    db.chat_messages.findMany.mockResolvedValue([] as never);

    await storeMessages([reply]);

    expect(db.chat_messages.createMany).toHaveBeenCalledWith({
      data: [{ ...stored(reply), gif, replyTo }],
    });
    expect(db.conversations.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastMessage: 'Sent a GIF' }),
      }),
    );
  });

  it('does nothing for an empty batch', async () => {
    await storeMessages([]);

    expect(db.chat_messages.findMany).not.toHaveBeenCalled();
  });
});

describe('editMessage', () => {
  const messageId = '7'.repeat(24);

  beforeEach(() => {
    db.conversations.findUnique.mockResolvedValue(shopRow as never);
    db.chat_messages.findFirst.mockResolvedValue(storedRow(messageId) as never);
  });

  it('changes the text, marks it edited, refreshes the preview and tells the chat', async () => {
    const edited = await editMessage(shopper, conversationId, messageId, {
      body: ' Hello there ',
    });

    expect(edited).toMatchObject({ body: 'Hello there' });
    expect(edited.editedAt).not.toBeNull();
    expect(db.chat_messages.update).toHaveBeenCalledWith({
      where: { id: messageId },
      data: { body: 'Hello there', editedAt: new Date(edited.editedAt ?? '') },
    });
    expect(db.conversations.updateMany).toHaveBeenCalledWith({
      where: {
        id: conversationId,
        lastMessageAt: new Date('2026-10-08T09:30:00.000Z'),
      },
      data: { lastMessage: 'Hello there' },
    });
    const [{ value }] = producer.send.mock.calls[0][0].messages;
    expect(JSON.parse(value)).toEqual({
      type: 'updated',
      message: edited,
      audience: { userId, sellerId, support: false },
    });
  });

  it('leaves an unchanged message alone', async () => {
    await editMessage(shopper, conversationId, messageId, { body: 'Hello' });

    expect(db.chat_messages.update).not.toHaveBeenCalled();
    expect(producer.send).not.toHaveBeenCalled();
  });

  it('only lets people edit their own, live, non-GIF messages', async () => {
    await expect(
      editMessage(seller, conversationId, messageId, { body: 'Mine now' }),
    ).rejects.toMatchObject({ status: 403 });

    db.chat_messages.findFirst.mockResolvedValue({
      ...storedRow(messageId),
      deletedAt: new Date(),
    } as never);
    await expect(
      editMessage(shopper, conversationId, messageId, { body: 'Back' }),
    ).rejects.toMatchObject({ status: 400 });

    db.chat_messages.findFirst.mockResolvedValue({
      ...storedRow(messageId),
      body: '',
      gif: {
        kind: 'gif',
        url: 'https://media.giphy.com/media/a/200.gif',
        width: 1,
        height: 1,
        title: '',
      },
    } as never);
    await expect(
      editMessage(shopper, conversationId, messageId, { body: 'Text' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(db.chat_messages.update).not.toHaveBeenCalled();
  });

  it('only empties the text when photos or documents remain', async () => {
    await expect(
      editMessage(shopper, conversationId, messageId, { body: ' ' }),
    ).rejects.toMatchObject({ status: 400 });

    db.chat_messages.findFirst.mockResolvedValue({
      ...storedRow(messageId),
      attachments: [`${endpoint}/chat/user-${userId}/a.jpg`],
    } as never);
    await expect(
      editMessage(shopper, conversationId, messageId, { body: '' }),
    ).resolves.toMatchObject({ body: '' });
  });

  it('rejects bad input and messages that aren’t in the chat', async () => {
    await expect(
      editMessage(shopper, conversationId, messageId, {}),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      editMessage(shopper, conversationId, messageId, {
        body: 'x'.repeat(5000),
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      editMessage(shopper, conversationId, 'nope', { body: 'Hi' }),
    ).rejects.toMatchObject({ status: 404 });

    db.chat_messages.findFirst.mockResolvedValue(null);
    await expect(
      editMessage(shopper, conversationId, messageId, { body: 'Hi' }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('deleteMessage', () => {
  const messageId = '7'.repeat(24);

  beforeEach(() => {
    db.conversations.findUnique.mockResolvedValue(shopRow as never);
    db.chat_messages.findFirst.mockResolvedValue({
      ...storedRow(messageId),
      attachments: [`${endpoint}/chat/user-${userId}/a.jpg`],
      reactions: [{ emoji: '👍', key: `seller:${sellerId}`, name: 'Baraka' }],
    } as never);
  });

  it('removes what it said for everyone, including where it’s quoted', async () => {
    const deleted = await deleteMessage(shopper, conversationId, messageId);

    expect(deleted).toMatchObject({
      body: '',
      attachments: [],
      files: [],
      gif: null,
      reactions: [],
    });
    expect(deleted.deletedAt).not.toBeNull();
    expect(db.chat_messages.update).toHaveBeenCalledWith({
      where: { id: messageId },
      data: {
        body: '',
        attachments: { set: [] },
        files: { set: [] },
        gif: { set: null },
        replyTo: { set: null },
        reactions: { set: [] },
        deletedAt: new Date(deleted.deletedAt ?? ''),
      },
    });
    expect(db.chat_messages.updateMany).toHaveBeenCalledWith({
      where: { conversationId, replyTo: { is: { id: messageId } } },
      data: {
        replyTo: {
          set: {
            id: messageId,
            senderName: 'Amina',
            preview: 'This message was deleted',
          },
        },
      },
    });
    expect(db.conversations.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { lastMessage: 'This message was deleted' },
      }),
    );
    const [{ value }] = producer.send.mock.calls[0][0].messages;
    expect(JSON.parse(value)).toMatchObject({
      type: 'updated',
      message: { id: messageId, deletedAt: deleted.deletedAt },
    });
  });

  it('only lets people delete their own messages, once', async () => {
    await expect(
      deleteMessage(seller, conversationId, messageId),
    ).rejects.toMatchObject({ status: 403 });

    db.chat_messages.findFirst.mockResolvedValue({
      ...storedRow(messageId),
      deletedAt: new Date(),
    } as never);
    await deleteMessage(shopper, conversationId, messageId);
    expect(db.chat_messages.update).not.toHaveBeenCalled();
  });
});

describe('reactToMessage', () => {
  const messageId = '7'.repeat(24);
  const sellerKey = `seller:${sellerId}`;
  const userKey = `user:${userId}`;

  beforeEach(() => {
    db.conversations.findUnique.mockResolvedValue(shopRow as never);
    db.chat_messages.findFirst.mockResolvedValue({
      ...storedRow(messageId),
      reactions: [{ emoji: '❤️', key: userKey, name: 'Amina' }],
    } as never);
  });

  it('adds a reaction and tells the chat', async () => {
    const reacted = await reactToMessage(seller, conversationId, messageId, {
      emoji: '👍',
    });

    expect(reacted.reactions).toEqual([
      { emoji: '❤️', key: userKey, name: 'Amina' },
      { emoji: '👍', key: sellerKey, name: 'Baraka' },
    ]);
    expect(db.chat_messages.update).toHaveBeenCalledWith({
      where: { id: messageId },
      data: { reactions: { set: reacted.reactions } },
    });
    const [{ value }] = producer.send.mock.calls[0][0].messages;
    expect(JSON.parse(value)).toMatchObject({ type: 'updated' });
    expect(limiter.take).toHaveBeenCalledWith(sellerKey);
  });

  it('swaps a different emoji and takes the same one away', async () => {
    await expect(
      reactToMessage(shopper, conversationId, messageId, { emoji: '😂' }),
    ).resolves.toMatchObject({
      reactions: [{ emoji: '😂', key: userKey, name: 'Amina' }],
    });
    await expect(
      reactToMessage(shopper, conversationId, messageId, { emoji: '❤️' }),
    ).resolves.toMatchObject({ reactions: [] });
  });

  it('only takes a single emoji, on live messages, within the limits', async () => {
    for (const emoji of ['hi', '', '👍 👍', 7]) {
      await expect(
        reactToMessage(seller, conversationId, messageId, { emoji }),
      ).rejects.toMatchObject({ status: 400 });
    }
    await expect(
      reactToMessage(seller, conversationId, messageId, { emoji: '👍🏽' }),
    ).resolves.toBeDefined();

    db.chat_messages.findFirst.mockResolvedValue({
      ...storedRow(messageId),
      deletedAt: new Date(),
    } as never);
    await expect(
      reactToMessage(seller, conversationId, messageId, { emoji: '👍' }),
    ).rejects.toMatchObject({ status: 400 });

    limiter.take.mockResolvedValue(false);
    await expect(
      reactToMessage(seller, conversationId, messageId, { emoji: '👍' }),
    ).rejects.toMatchObject({ status: 429 });
  });

  describe('with sockets on this instance', () => {
    const deliver = vi.fn();
    beforeEach(() => deliverLocallyWith(deliver));
    afterEach(() => {
      deliverLocallyWith(null);
      producer.send.mockReset();
    });

    it('delivers here before Kafka, which carries it to the other instances', async () => {
      producer.send.mockImplementation(async () => {
        expect(deliver).toHaveBeenCalledTimes(1);
      });
      const reacted = await reactToMessage(seller, conversationId, messageId, {
        emoji: '👍',
      });

      expect(deliver).toHaveBeenCalledWith({
        type: 'updated',
        message: reacted,
        audience: expect.objectContaining({ support: false }),
      });
      const [{ value }] = producer.send.mock.calls[0][0].messages;
      expect(JSON.parse(value)).toMatchObject({
        type: 'updated',
        origin: expect.stringMatching(/.+-\d+$/),
      });
    });

    it('keeps the saved reaction when Kafka is down', async () => {
      producer.send.mockRejectedValue(new Error('broker down'));

      await expect(
        reactToMessage(seller, conversationId, messageId, { emoji: '👍' }),
      ).resolves.toMatchObject({
        reactions: expect.arrayContaining([
          expect.objectContaining({ emoji: '👍' }),
        ]),
      });
      expect(deliver).toHaveBeenCalled();
    });
  });
});

describe('announceTyping', () => {
  it('tells the chat who is typing', async () => {
    db.conversations.findUnique.mockResolvedValue(directRow as never);

    await announceTyping(shopper, conversationId);

    expect(producer.send).toHaveBeenCalledWith({
      topic: 'chat_messages',
      messages: [
        {
          key: conversationId,
          value: JSON.stringify({
            type: 'typing',
            conversationId,
            from: { key: `user:${userId}`, name: 'Amina' },
            audience: { participants: directKeys, support: false },
          }),
        },
      ],
    });
  });

  it('hides chats the typist isn’t in', async () => {
    db.conversations.findUnique.mockResolvedValue(directRow as never);

    await expect(announceTyping(admin, conversationId)).rejects.toMatchObject({
      status: 404,
    });
    expect(producer.send).not.toHaveBeenCalled();
  });
});
