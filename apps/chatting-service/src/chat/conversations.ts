import { isAccountType, type AccountType } from '@org/utils/auth';
import { getProducer } from '@org/utils/kafka';
import { HttpError } from '../http-error';
import { log } from '../log';
import { prisma } from '../prisma';
import { isChatFileOf } from './attachments';
import { findActiveAccount, type Participant } from './participants';
import { presenceStore, type Presence } from './presence';
import {
  CHAT_MESSAGES_TOPIC,
  DELETED_TEXT,
  MAX_ATTACHMENTS,
  MAX_MESSAGE_LENGTH,
  isObjectId,
  newObjectId,
  parseMessageContent,
  parseParticipantKey,
  participantKey,
  previewOf,
  type ChatAudience,
  type ChatEnvelope,
  type ChatMessage,
  type ChatReaction,
} from './protocol';
import { messageLimiter } from './rate-limit';

export { previewOf };

export type ConversationKind = 'shop' | 'support' | 'direct';

type Person = { role: AccountType; id: string };

/** A chat as one participant sees it in their list. */
export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  /** Who the viewer is talking to. */
  title: string;
  /** For admins in support chats, and in direct chats: "Shopper", "Seller" or "MlimaLink admin". */
  subtitle: string | null;
  userId: string | null;
  sellerId: string | null;
  shopId: string | null;
  /** Everyone in the chat. Support chats list the shopper or seller; admins answer as a team. */
  participants: Person[];
  /**
   * The person the viewer is talking to: the other person in a direct chat, the seller
   * or shopper in a shop chat, the shopper or seller for an admin in a support chat.
   * Null for shoppers and sellers in support chats.
   */
  counterpart: Person | null;
  /** The counterpart's online status, like Teams; null when there's no counterpart. */
  presence: Presence | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  /** Messages from others since the viewer last read the chat, up to UNSEEN_CAP. */
  unseenCount: number;
}

/**
 * Start or resume a chat. Anyone can name a person with `to: { role, id }` for a direct
 * chat; shoppers can also name a shop, shoppers and sellers can ask support, and admins
 * can open a support chat with a shopper or seller.
 */
export type OpenConversationInput = {
  to?: unknown;
  shopId?: unknown;
  support?: unknown;
  userId?: unknown;
  sellerId?: unknown;
};

/**
 * What a sender provides: text, photo URLs and documents from their chat folder, or a
 * GIPHY GIF or sticker on its own; optionally the id of the message it answers.
 */
export type MessageInput = {
  body?: unknown;
  attachments?: unknown;
  files?: unknown;
  gif?: unknown;
  replyToId?: unknown;
};

export const SUPPORT_TITLE = 'MlimaLink support';
const LIST_LIMIT = 50;
/** Messages per page by default, and the most a client may ask for. */
export const MESSAGES_PAGE_SIZE = 20;
export const MAX_MESSAGES_PAGE_SIZE = 50;
/** How much of a quoted message a reply keeps. */
const QUOTE_LENGTH = 140;
/** Different emojis on one message. */
const MAX_DISTINCT_REACTIONS = 20;
/** Messages written per createMany. */
const INSERT_CHUNK = 500;
/** Unseen counts stop here, so a busy chat never needs a big count; UIs show "99+". */
export const UNSEEN_CAP = 100;

const ROLE_LABELS: Record<AccountType, string> = {
  user: 'Shopper',
  seller: 'Seller',
  admin: 'MlimaLink admin',
};

const conversationSelect = {
  id: true,
  kind: true,
  userId: true,
  sellerId: true,
  shopId: true,
  participantKeys: true,
  lastMessage: true,
  lastMessageAt: true,
  user: { select: { name: true } },
  seller: { select: { name: true } },
  shop: { select: { name: true } },
} as const;

type ConversationRow = {
  id: string;
  kind: string;
  userId: string | null;
  sellerId: string | null;
  shopId: string | null;
  participantKeys: string[];
  lastMessage: string | null;
  lastMessageAt: Date | null;
  user: { name: string } | null;
  seller: { name: string } | null;
  shop: { name: string } | null;
};

const notFound = () => new HttpError(404, 'Conversation not found.');
const messageNotFound = () => new HttpError(404, 'Message not found.');

const keyOf = (person: Person) => participantKey(person.role, person.id);

/** Who hears about events in this chat. */
function audienceOf(
  row: Pick<
    ConversationRow,
    'kind' | 'userId' | 'sellerId' | 'participantKeys'
  >,
): ChatAudience {
  return {
    ...(row.userId && { userId: row.userId }),
    ...(row.sellerId && { sellerId: row.sellerId }),
    ...(row.kind === 'direct' && { participants: row.participantKeys }),
    support: row.kind === 'support',
  };
}

const chatUnavailable = () =>
  new HttpError(
    503,
    'Chat is unavailable right now. Please try again in a moment.',
  );

/** Publishes to the chat_messages topic, keyed by conversation so each chat stays in order. */
async function publish(envelope: ChatEnvelope): Promise<void> {
  const conversationId =
    'message' in envelope
      ? envelope.message.conversationId
      : envelope.conversationId;
  try {
    const producer = await getProducer();
    await producer.send({
      topic: CHAT_MESSAGES_TOPIC,
      messages: [{ key: conversationId, value: JSON.stringify(envelope) }],
    });
  } catch {
    throw chatUnavailable();
  }
}

type MessageRow = {
  id: string;
  conversationId: string;
  senderRole: string;
  senderId: string;
  senderName: string;
  body: string;
  attachments: string[];
  files?: ChatMessage['files'] | null;
  gif?: {
    kind: string;
    url: string;
    width: number;
    height: number;
    title: string;
  } | null;
  replyTo?: ChatMessage['replyTo'] | null;
  reactions?: ChatReaction[] | null;
  editedAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
};

/** A stored message as clients see it; messages from before a field existed get its default. */
function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderRole: row.senderRole as ChatMessage['senderRole'],
    senderId: row.senderId,
    senderName: row.senderName,
    body: row.body,
    attachments: row.attachments,
    files: (row.files ?? []).map(({ url, name, size, mimeType }) => ({
      url,
      name,
      size,
      mimeType,
    })),
    gif: row.gif
      ? {
          kind: row.gif.kind === 'sticker' ? 'sticker' : 'gif',
          url: row.gif.url,
          width: row.gif.width,
          height: row.gif.height,
          title: row.gif.title,
        }
      : null,
    replyTo: row.replyTo
      ? {
          id: row.replyTo.id,
          senderName: row.replyTo.senderName,
          preview: row.replyTo.preview,
        }
      : null,
    reactions: (row.reactions ?? []).map(({ emoji, key, name }) => ({
      emoji,
      key,
      name,
    })),
    editedAt: row.editedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function canAccess(viewer: Participant, row: ConversationRow): boolean {
  if (row.kind === 'direct') return row.participantKeys.includes(keyOf(viewer));
  if (viewer.role === 'user') return row.userId === viewer.id;
  if (viewer.role === 'seller') return row.sellerId === viewer.id;
  return row.kind === 'support';
}

type PeopleOf = Pick<
  ConversationRow,
  'kind' | 'userId' | 'sellerId' | 'participantKeys'
>;

const shopperOf = (row: PeopleOf): Person | null =>
  row.userId ? { role: 'user', id: row.userId } : null;
const sellerOf = (row: PeopleOf): Person | null =>
  row.sellerId ? { role: 'seller', id: row.sellerId } : null;

function counterpartOf(viewer: Participant, row: PeopleOf): Person | null {
  if (row.kind === 'direct') {
    const own = keyOf(viewer);
    return parseParticipantKey(row.participantKeys.find((key) => key !== own));
  }
  if (row.kind === 'shop') {
    return viewer.role === 'user' ? sellerOf(row) : shopperOf(row);
  }
  return viewer.role === 'admin' ? (shopperOf(row) ?? sellerOf(row)) : null;
}

function participantsOf(row: ConversationRow): Person[] {
  if (row.kind === 'direct') {
    return row.participantKeys.flatMap((key) => parseParticipantKey(key) ?? []);
  }
  return [shopperOf(row), sellerOf(row)].filter(
    (person): person is Person => person !== null,
  );
}

/** Current names of these people, by participant key. */
async function namesOf(people: Person[]): Promise<Map<string, string>> {
  const idsFor = (role: AccountType) => [
    ...new Set(people.filter((p) => p.role === role).map((p) => p.id)),
  ];
  const select = { id: true, name: true } as const;
  const find = <T>(ids: string[], query: () => Promise<T[]>) =>
    ids.length ? query() : Promise.resolve([] as T[]);

  const userIds = idsFor('user');
  const sellerIds = idsFor('seller');
  const adminIds = idsFor('admin');
  const [users, sellers, admins] = await Promise.all([
    find(userIds, () =>
      prisma.users.findMany({ where: { id: { in: userIds } }, select }),
    ),
    find(sellerIds, () =>
      prisma.sellers.findMany({ where: { id: { in: sellerIds } }, select }),
    ),
    find(adminIds, () =>
      prisma.admins.findMany({ where: { id: { in: adminIds } }, select }),
    ),
  ]);

  const names = new Map<string, string>();
  users.forEach((u) => names.set(participantKey('user', u.id), u.name));
  sellers.forEach((s) => names.set(participantKey('seller', s.id), s.name));
  admins.forEach((a) => names.set(participantKey('admin', a.id), a.name));
  return names;
}

function titleFor(
  viewer: Participant,
  row: ConversationRow,
  names: Map<string, string>,
): Pick<ConversationSummary, 'title' | 'subtitle'> {
  if (row.kind === 'direct') {
    const other = counterpartOf(viewer, row);
    if (!other) return { title: 'Chat', subtitle: null };
    const label = ROLE_LABELS[other.role];
    return { title: names.get(keyOf(other)) ?? label, subtitle: label };
  }
  if (viewer.role === 'admin') {
    return row.userId
      ? { title: row.user?.name ?? 'Shopper', subtitle: 'Shopper' }
      : { title: row.seller?.name ?? 'Seller', subtitle: 'Seller' };
  }
  if (row.kind === 'support') return { title: SUPPORT_TITLE, subtitle: null };
  return viewer.role === 'user'
    ? { title: row.shop?.name ?? 'Shop', subtitle: null }
    : { title: row.user?.name ?? 'Shopper', subtitle: null };
}

/**
 * How many messages from others each chat has since the viewer last read it, capped at
 * UNSEEN_CAP. A chat they've never opened counts from its first message. Chats with
 * nothing newer than their read position aren't counted at all.
 */
async function unseenCounts(
  viewer: Participant,
  rows: Pick<ConversationRow, 'id' | 'lastMessageAt'>[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const active = rows.filter((row) => row.lastMessageAt);
  if (active.length === 0) return counts;

  const reads = await prisma.conversation_reads.findMany({
    where: {
      participant: keyOf(viewer),
      conversationId: { in: active.map((row) => row.id) },
    },
    select: { conversationId: true, lastReadAt: true },
  });
  const lastRead = new Map(
    reads.map((read) => [read.conversationId, read.lastReadAt]),
  );

  await Promise.all(
    active.map(async (row) => {
      const readAt = lastRead.get(row.id);
      if (readAt && row.lastMessageAt && row.lastMessageAt <= readAt) return;
      const count = await prisma.chat_messages.count({
        where: {
          conversationId: row.id,
          ...(readAt && { createdAt: { gt: readAt } }),
          NOT: { senderRole: viewer.role, senderId: viewer.id },
        },
        take: UNSEEN_CAP,
      });
      if (count > 0) counts.set(row.id, count);
    }),
  );
  return counts;
}

function toSummary(
  viewer: Participant,
  row: ConversationRow,
  names: Map<string, string>,
  unseen: Map<string, number>,
  presence: Map<string, Presence>,
): ConversationSummary {
  const counterpart = counterpartOf(viewer, row);
  return {
    id: row.id,
    kind: row.kind as ConversationKind,
    ...titleFor(viewer, row, names),
    userId: row.userId,
    sellerId: row.sellerId,
    shopId: row.shopId,
    participants: participantsOf(row),
    counterpart,
    presence: counterpart
      ? (presence.get(keyOf(counterpart)) ?? {
          status: 'offline',
          lastSeenAt: null,
        })
      : null,
    lastMessage: row.lastMessage,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    unseenCount: unseen.get(row.id) ?? 0,
  };
}

async function summarize(
  viewer: Participant,
  rows: ConversationRow[],
): Promise<ConversationSummary[]> {
  const counterparts = rows.map((row) => counterpartOf(viewer, row));
  const [names, unseen, presence] = await Promise.all([
    // Only direct chats are titled with a person's name; the others use the row's names.
    namesOf(
      rows.flatMap((row, index) =>
        row.kind === 'direct' ? (counterparts[index] ?? []) : [],
      ),
    ),
    unseenCounts(viewer, rows),
    presenceStore()
      .get([
        ...new Set(
          counterparts.flatMap((person) => (person ? keyOf(person) : [])),
        ),
      ])
      .catch(() => new Map<string, Presence>()),
  ]);
  return rows.map((row) => toSummary(viewer, row, names, unseen, presence));
}

/** The viewer's direct chats plus their shop and support chats; admins see every support chat. */
function chatsOf(viewer: Participant) {
  const ownChats =
    viewer.role === 'user'
      ? { userId: viewer.id }
      : viewer.role === 'seller'
        ? { sellerId: viewer.id }
        : { kind: 'support' };
  return { OR: [ownChats, { participantKeys: { has: keyOf(viewer) } }] };
}

/**
 * The people the viewer talks to in their most recent chats (the same ones the list
 * shows), as participant keys: whose status changes they may hear about.
 */
export async function counterpartKeys(viewer: Participant): Promise<string[]> {
  const rows = await prisma.conversations.findMany({
    where: chatsOf(viewer),
    select: {
      kind: true,
      userId: true,
      sellerId: true,
      participantKeys: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: LIST_LIMIT,
  });
  const keys = rows.flatMap((row) => {
    const person = counterpartOf(viewer, row);
    return person ? keyOf(person) : [];
  });
  return [...new Set(keys)];
}

/** The viewer's chats, most recently active first. */
export async function listConversations(
  viewer: Participant,
): Promise<ConversationSummary[]> {
  const rows = await prisma.conversations.findMany({
    where: chatsOf(viewer),
    select: conversationSelect,
    orderBy: { updatedAt: 'desc' },
    take: LIST_LIMIT,
  });
  return summarize(viewer, rows);
}

/**
 * Unseen messages across the viewer's chats, for a badge: the same chats the list shows,
 * capped at UNSEEN_CAP.
 */
export async function countUnseen(
  viewer: Participant,
): Promise<{ total: number }> {
  const rows = await prisma.conversations.findMany({
    where: chatsOf(viewer),
    select: { id: true, lastMessageAt: true },
    orderBy: { updatedAt: 'desc' },
    take: LIST_LIMIT,
  });
  const counts = await unseenCounts(viewer, rows);
  let total = 0;
  for (const count of counts.values()) total += count;
  return { total: Math.min(total, UNSEEN_CAP) };
}

/** Moves the viewer's read position in a chat forward to `at`; never backwards. */
async function recordRead(
  conversationId: string,
  viewer: Participant,
  at: Date,
): Promise<void> {
  const participant = keyOf(viewer);
  const forward = await prisma.conversation_reads.updateMany({
    where: { conversationId, participant, lastReadAt: { lt: at } },
    data: { lastReadAt: at },
  });
  if (forward.count > 0) return;
  try {
    await prisma.conversation_reads.create({
      data: { conversationId, participant, lastReadAt: at },
    });
  } catch (error) {
    // Already at or past `at`, or another request created it first.
    if (!isUniqueViolation(error)) throw error;
  }
}

/**
 * Tells the others in the chat how far the viewer has read, for seen receipts. Reading
 * still counts if this fails, so it's only logged.
 */
async function announceSeen(
  row: ConversationRow,
  viewer: Participant,
  at: Date,
): Promise<void> {
  try {
    await publish({
      type: 'seen',
      conversationId: row.id,
      reader: keyOf(viewer),
      lastReadAt: at.toISOString(),
      audience: audienceOf(row),
    });
  } catch {
    log('warn', `Couldn't announce that chat ${row.id} was read.`);
  }
}

/**
 * How far the other side has read: the counterpart in shop and direct chats, the
 * shopper or seller for admins in support chats, and any admin for the shopper or
 * seller there.
 */
async function otherSideReadAt(
  viewer: Participant,
  row: ConversationRow,
): Promise<string | null> {
  const other =
    row.kind === 'support' && viewer.role !== 'admin'
      ? { startsWith: 'admin:' }
      : (() => {
          const person = counterpartOf(viewer, row);
          return person ? keyOf(person) : null;
        })();
  if (!other) return null;
  const reads = await prisma.conversation_reads.findMany({
    where: { conversationId: row.id, participant: other },
    select: { lastReadAt: true },
    orderBy: { lastReadAt: 'desc' },
    take: 1,
  });
  return reads[0]?.lastReadAt.toISOString() ?? null;
}

/** Marks everything in the chat up to now as seen by the viewer. */
export async function markRead(
  viewer: Participant,
  conversationId: string,
): Promise<{ conversationId: string; lastReadAt: string }> {
  const row = await findAccessible(viewer, conversationId);
  const at = new Date();
  await recordRead(row.id, viewer, at);
  await announceSeen(row, viewer, at);
  return { conversationId: row.id, lastReadAt: at.toISOString() };
}

type NewConversation = {
  key: string;
  kind: ConversationKind;
  userId?: string;
  sellerId?: string;
  shopId?: string;
  participantKeys?: string[];
};

async function resolveDirectConversation(
  viewer: Participant,
  to: unknown,
): Promise<NewConversation> {
  const { role, id } = (to ?? {}) as Record<string, unknown>;
  if (!isAccountType(role) || !isObjectId(id)) {
    throw new HttpError(
      400,
      'Choose who to message: { to: { role: "user" | "seller" | "admin", id } }.',
    );
  }
  if (role === viewer.role && id === viewer.id) {
    throw new HttpError(400, 'You can’t message yourself.');
  }
  if (!(await findActiveAccount(role, id))) {
    throw new HttpError(404, 'That person isn’t available to message.');
  }
  const participantKeys = [keyOf(viewer), participantKey(role, id)].sort();
  return {
    key: `direct:${participantKeys.join('|')}`,
    kind: 'direct',
    participantKeys,
  };
}

const OPEN_OPTIONS = ['to', 'shopId', 'support', 'userId', 'sellerId'] as const;

async function resolveSupportWith(
  option: 'userId' | 'sellerId',
  id: unknown,
): Promise<NewConversation> {
  if (!isObjectId(id))
    throw new HttpError(400, `${option} must be a valid id.`);
  // Admins may open support chats with suspended accounts, e.g. to explain why.
  if (option === 'userId') {
    const user = await prisma.users.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) throw new HttpError(404, 'Shopper not found.');
    return { key: `support:user:${user.id}`, kind: 'support', userId: user.id };
  }
  const seller = await prisma.sellers.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!seller) throw new HttpError(404, 'Seller not found.');
  return {
    key: `support:seller:${seller.id}`,
    kind: 'support',
    sellerId: seller.id,
  };
}

async function resolveShopConversation(
  viewer: Participant,
  shopId: unknown,
): Promise<NewConversation> {
  if (viewer.role !== 'user') {
    throw new HttpError(
      400,
      'Only shoppers can message a shop. Use { to } for a direct message.',
    );
  }
  if (!isObjectId(shopId))
    throw new HttpError(400, 'shopId must be a valid id.');
  const shop = await prisma.shops.findUnique({
    where: { id: shopId },
    select: { id: true, sellerId: true },
  });
  if (!shop) throw new HttpError(404, 'Shop not found.');
  if (!(await findActiveAccount('seller', shop.sellerId))) {
    throw new HttpError(404, 'That shop isn’t taking messages right now.');
  }
  return {
    key: `shop:${shop.id}:${viewer.id}`,
    kind: 'shop',
    userId: viewer.id,
    sellerId: shop.sellerId,
    shopId: shop.id,
  };
}

async function resolveNewConversation(
  viewer: Participant,
  input: OpenConversationInput,
): Promise<NewConversation> {
  const given = OPEN_OPTIONS.filter((option) => input[option] !== undefined);
  if (given.length !== 1) {
    throw new HttpError(
      400,
      'Send exactly one of: to, shopId, support, userId or sellerId.',
    );
  }

  switch (given[0]) {
    case 'to':
      return resolveDirectConversation(viewer, input.to);
    case 'shopId':
      return resolveShopConversation(viewer, input.shopId);
    case 'support':
      if (input.support !== true) {
        throw new HttpError(400, 'support must be true.');
      }
      if (viewer.role === 'admin') {
        throw new HttpError(
          400,
          'Admins answer support chats. Use userId or sellerId to open one.',
        );
      }
      return viewer.role === 'user'
        ? {
            key: `support:user:${viewer.id}`,
            kind: 'support',
            userId: viewer.id,
          }
        : {
            key: `support:seller:${viewer.id}`,
            kind: 'support',
            sellerId: viewer.id,
          };
    case 'userId':
    case 'sellerId':
      if (viewer.role !== 'admin') {
        throw new HttpError(
          400,
          'Only admins open support chats with a person. Use { to } for a direct message.',
        );
      }
      return resolveSupportWith(given[0], input[given[0]]);
  }
}

const isUniqueViolation = (error: unknown) =>
  (error as { code?: unknown })?.code === 'P2002';

/** Finds the chat for this pair, creating it the first time. */
export async function openConversation(
  viewer: Participant,
  input: unknown,
): Promise<ConversationSummary> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new HttpError(400, 'Send a JSON object.');
  }
  const { key, ...data } = await resolveNewConversation(
    viewer,
    input as OpenConversationInput,
  );
  let row: ConversationRow;
  try {
    row = await prisma.conversations.upsert({
      where: { key },
      create: { key, ...data },
      update: {},
      select: conversationSelect,
    });
  } catch (error) {
    // Two first messages at once: the other request created it.
    if (!isUniqueViolation(error)) throw error;
    row = await prisma.conversations.findUniqueOrThrow({
      where: { key },
      select: conversationSelect,
    });
  }
  const [summary] = await summarize(viewer, [row]);
  return summary;
}

async function findAccessible(
  viewer: Participant,
  conversationId: string,
): Promise<ConversationRow> {
  if (!isObjectId(conversationId)) throw notFound();
  const row = await prisma.conversations.findUnique({
    where: { id: conversationId },
    select: conversationSelect,
  });
  // Someone else's chat looks the same as a missing one.
  if (!row || !canAccess(viewer, row)) throw notFound();
  return row;
}

/** One chat the viewer is in, as it appears in their list. */
export async function getConversation(
  viewer: Participant,
  conversationId: string,
): Promise<ConversationSummary> {
  const row = await findAccessible(viewer, conversationId);
  const [summary] = await summarize(viewer, [row]);
  return summary;
}

export interface MessagePage {
  /** Newest first. */
  messages: ChatMessage[];
  hasMore: boolean;
  /** Pass as `cursor` for the next, older page; null on the last page. */
  nextCursor: string | null;
  /** Set on the first page, which marks the chat read. ISO date string. */
  lastReadAt: string | null;
  /** First page only: how far the other side has read, for seen receipts. */
  seenAt: string | null;
}

/**
 * A page of the chat's messages, newest first. Without a cursor it's the latest page,
 * and the chat is marked read for the viewer, clearing their unseen count; with one,
 * it's the messages just older than that message.
 */
export async function listMessages(
  viewer: Participant,
  conversationId: string,
  {
    cursor,
    limit = MESSAGES_PAGE_SIZE,
  }: { cursor?: string; limit?: number } = {},
): Promise<MessagePage> {
  const row = await findAccessible(viewer, conversationId);

  let olderThanCursor = {};
  if (cursor !== undefined) {
    const anchor = isObjectId(cursor)
      ? await prisma.chat_messages.findFirst({
          where: { id: cursor, conversationId: row.id },
          select: { id: true, createdAt: true },
        })
      : null;
    if (!anchor) {
      throw new HttpError(
        400,
        'cursor must be the id of a message in this chat.',
      );
    }
    // Messages can share a timestamp, so the id breaks ties.
    olderThanCursor = {
      OR: [
        { createdAt: { lt: anchor.createdAt } },
        { createdAt: anchor.createdAt, id: { lt: anchor.id } },
      ],
    };
  }

  const rows = await prisma.chat_messages.findMany({
    where: { conversationId: row.id, ...olderThanCursor },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const messages = rows.slice(0, limit).map(toMessage);

  let lastReadAt: string | null = null;
  let seenAt: string | null = null;
  if (cursor === undefined) {
    const at = new Date();
    try {
      await recordRead(row.id, viewer, at);
      lastReadAt = at.toISOString();
      await announceSeen(row, viewer, at);
    } catch (error) {
      log('warn', `Couldn't mark chat ${row.id} as read.`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    seenAt = await otherSideReadAt(viewer, row).catch(() => null);
  }

  return {
    messages,
    hasMore,
    nextCursor: hasMore ? (messages.at(-1)?.id ?? null) : null,
    lastReadAt,
    seenAt,
  };
}

/**
 * Publishes a message to the chat_messages topic and returns it. It's stored and
 * delivered by the consumers, so it shows up in history a moment later.
 */
export async function sendMessage(
  sender: Participant,
  conversationId: string,
  input: MessageInput,
): Promise<ChatMessage> {
  const content = parseMessageContent(input);
  if (!content) {
    throw new HttpError(
      400,
      `Write a message of up to ${MAX_MESSAGE_LENGTH} characters, attach up to ${MAX_ATTACHMENTS} photos or documents, or send a GIF on its own.`,
    );
  }
  const uploads = [...content.attachments, ...content.files.map((f) => f.url)];
  if (!uploads.every((url) => isChatFileOf(url, sender))) {
    throw new HttpError(
      400,
      'Upload photos and documents through chat before sending them.',
    );
  }
  if (input.replyToId !== undefined && !isObjectId(input.replyToId)) {
    throw new HttpError(400, 'replyToId must be a message id.');
  }
  await takeMessageAllowance(sender);
  const row = await findAccessible(sender, conversationId);
  const replyTo = input.replyToId
    ? await quoteOf(row.id, input.replyToId as string)
    : null;

  const now = Date.now();
  const message: ChatMessage = {
    id: newObjectId(now),
    conversationId: row.id,
    senderRole: sender.role,
    senderId: sender.id,
    senderName: sender.name,
    ...content,
    replyTo,
    reactions: [],
    editedAt: null,
    deletedAt: null,
    createdAt: new Date(now).toISOString(),
  };
  await publish({ type: 'message', message, audience: audienceOf(row) });
  // Replying means the sender has seen the chat. The message is already sent, so a
  // failure here only leaves an unseen count too high until they next open it.
  await recordRead(row.id, sender, new Date(now)).catch((error: unknown) =>
    log('warn', `Couldn't mark chat ${row.id} as read after sending.`, {
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  return message;
}

async function takeMessageAllowance(sender: Participant) {
  if (!(await messageLimiter().take(keyOf(sender)))) {
    throw new HttpError(
      429,
      'You’re sending messages too fast. Wait a moment and try again.',
    );
  }
}

/** The message being answered, as it reads now; it must be in the same chat. */
async function quoteOf(conversationId: string, messageId: string) {
  const quoted = await prisma.chat_messages.findFirst({
    where: { id: messageId, conversationId },
  });
  if (!quoted || quoted.deletedAt) {
    throw new HttpError(
      400,
      'The message you’re replying to isn’t available any more.',
    );
  }
  return {
    id: quoted.id,
    senderName: quoted.senderName,
    preview: previewOf(toMessage(quoted)).slice(0, QUOTE_LENGTH),
  };
}

/** A message in a chat the viewer is in, with the chat. */
async function findMessage(
  viewer: Participant,
  conversationId: string,
  messageId: string,
) {
  const row = await findAccessible(viewer, conversationId);
  const stored = isObjectId(messageId)
    ? await prisma.chat_messages.findFirst({
        where: { id: messageId, conversationId: row.id },
      })
    : null;
  if (!stored) throw messageNotFound();
  return { row, message: toMessage(stored) };
}

function ownMessage(viewer: Participant, message: ChatMessage, action: string) {
  if (message.senderRole !== viewer.role || message.senderId !== viewer.id) {
    throw new HttpError(403, `You can only ${action} your own messages.`);
  }
}

/** Keeps the chat list right when its latest message changes. */
async function refreshPreview(message: ChatMessage) {
  await prisma.conversations.updateMany({
    where: {
      id: message.conversationId,
      lastMessageAt: new Date(message.createdAt),
    },
    data: { lastMessage: previewOf(message) },
  });
}

/** Writes nothing new; tells everyone in the chat the message changed. */
async function announceUpdate(row: ConversationRow, message: ChatMessage) {
  await publish({ type: 'updated', message, audience: audienceOf(row) });
}

/**
 * Changes the text of the viewer's own message, like Teams: any time, marked as edited.
 * The text may only be emptied when the message still has photos or documents.
 */
export async function editMessage(
  viewer: Participant,
  conversationId: string,
  messageId: string,
  input: { body?: unknown },
): Promise<ChatMessage> {
  if (typeof input.body !== 'string') {
    throw new HttpError(400, 'Send the new text as { body }.');
  }
  const body = input.body.trim();
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new HttpError(
      400,
      `Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`,
    );
  }
  const { row, message } = await findMessage(viewer, conversationId, messageId);
  ownMessage(viewer, message, 'edit');
  if (message.deletedAt) throw new HttpError(400, 'That message was deleted.');
  if (message.gif) {
    throw new HttpError(400, 'GIFs and stickers can’t be edited.');
  }
  if (!body && !message.attachments.length && !message.files.length) {
    throw new HttpError(
      400,
      'A message needs some text. Delete it instead to remove it.',
    );
  }
  if (body === message.body) return message;

  const editedAt = new Date();
  await prisma.chat_messages.update({
    where: { id: message.id },
    data: { body, editedAt },
  });
  const edited = { ...message, body, editedAt: editedAt.toISOString() };
  await refreshPreview(edited);
  await announceUpdate(row, edited);
  return edited;
}

/**
 * Deletes the viewer's own message for everyone, like Teams: what it said is removed and
 * it reads "This message was deleted", including where it's quoted.
 */
export async function deleteMessage(
  viewer: Participant,
  conversationId: string,
  messageId: string,
): Promise<ChatMessage> {
  const { row, message } = await findMessage(viewer, conversationId, messageId);
  ownMessage(viewer, message, 'delete');
  if (message.deletedAt) return message;

  const deletedAt = new Date();
  await prisma.chat_messages.update({
    where: { id: message.id },
    data: {
      body: '',
      attachments: { set: [] },
      files: { set: [] },
      gif: { set: null },
      replyTo: { set: null },
      reactions: { set: [] },
      deletedAt,
    },
  });
  await prisma.chat_messages.updateMany({
    where: { conversationId: row.id, replyTo: { is: { id: message.id } } },
    data: {
      replyTo: {
        set: {
          id: message.id,
          senderName: message.senderName,
          preview: DELETED_TEXT,
        },
      },
    },
  });
  const deleted: ChatMessage = {
    ...message,
    body: '',
    attachments: [],
    files: [],
    gif: null,
    replyTo: null,
    reactions: [],
    deletedAt: deletedAt.toISOString(),
  };
  await refreshPreview(deleted);
  await announceUpdate(row, deleted);
  return deleted;
}

const EMOJI =
  /^(?=.*\p{Extended_Pictographic})[\p{Extended_Pictographic}\p{Emoji_Component}]{1,16}$/u;

/**
 * Adds the viewer's reaction, or takes it away when it's the same emoji; each person has
 * one reaction per message, like WhatsApp.
 */
export async function reactToMessage(
  viewer: Participant,
  conversationId: string,
  messageId: string,
  input: { emoji?: unknown },
): Promise<ChatMessage> {
  const { emoji } = input;
  if (typeof emoji !== 'string' || !EMOJI.test(emoji)) {
    throw new HttpError(400, 'React with a single emoji.');
  }
  await takeMessageAllowance(viewer);
  const { row, message } = await findMessage(viewer, conversationId, messageId);
  if (message.deletedAt) {
    throw new HttpError(400, 'You can’t react to a deleted message.');
  }
  const key = keyOf(viewer);
  const mine = message.reactions.find((reaction) => reaction.key === key);
  const others = message.reactions.filter((reaction) => reaction.key !== key);
  const reactions =
    mine?.emoji === emoji
      ? others
      : [...others, { emoji, key, name: viewer.name }];
  if (new Set(reactions.map((r) => r.emoji)).size > MAX_DISTINCT_REACTIONS) {
    throw new HttpError(400, 'That message has all the reactions it can take.');
  }

  await prisma.chat_messages.update({
    where: { id: message.id },
    data: { reactions: { set: reactions } },
  });
  const reacted = { ...message, reactions };
  await announceUpdate(row, reacted);
  return reacted;
}

/** Tells the others in the chat the viewer is typing. */
export async function announceTyping(
  viewer: Participant,
  conversationId: string,
): Promise<void> {
  const row = await findAccessible(viewer, conversationId);
  await publish({
    type: 'typing',
    conversationId: row.id,
    from: { key: keyOf(viewer), name: viewer.name },
    audience: audienceOf(row),
  });
}

/**
 * Writes a batch of messages from the topic. Messages already stored (Kafka can deliver
 * a batch again) are skipped, the rest are inserted together, and each chat's preview
 * is updated once, to its latest message.
 */
export async function storeMessages(messages: ChatMessage[]): Promise<void> {
  const unique = [
    ...new Map(messages.map((message) => [message.id, message])).values(),
  ];
  if (unique.length === 0) return;

  const existing = await prisma.chat_messages.findMany({
    where: { id: { in: unique.map((message) => message.id) } },
    select: { id: true },
  });
  const stored = new Set(existing.map((row) => row.id));
  const fresh = unique.filter((message) => !stored.has(message.id));
  for (let start = 0; start < fresh.length; start += INSERT_CHUNK) {
    await prisma.chat_messages.createMany({
      data: fresh.slice(start, start + INSERT_CHUNK).map((message) => ({
        id: message.id,
        conversationId: message.conversationId,
        senderRole: message.senderRole,
        senderId: message.senderId,
        senderName: message.senderName,
        body: message.body,
        attachments: message.attachments,
        files: message.files,
        ...(message.gif && { gif: message.gif }),
        ...(message.replyTo && { replyTo: message.replyTo }),
        reactions: [],
        createdAt: new Date(message.createdAt),
      })),
    });
  }

  const latest = new Map<string, ChatMessage>();
  for (const message of unique) {
    const current = latest.get(message.conversationId);
    if (!current || current.createdAt <= message.createdAt) {
      latest.set(message.conversationId, message);
    }
  }
  // updateMany, so a message for a deleted chat is skipped instead of retried forever,
  // and a redelivered older message doesn't replace a newer preview.
  await Promise.all(
    [...latest.values()].map((message) => {
      const createdAt = new Date(message.createdAt);
      return prisma.conversations.updateMany({
        where: {
          id: message.conversationId,
          OR: [
            { lastMessageAt: { isSet: false } },
            { lastMessageAt: null },
            { lastMessageAt: { lte: createdAt } },
          ],
        },
        data: { lastMessage: previewOf(message), lastMessageAt: createdAt },
      });
    }),
  );
}
