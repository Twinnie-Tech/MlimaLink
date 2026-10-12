import { isAccountType, type AccountType } from '@org/utils/auth';
import { getProducer } from '@org/utils/kafka';
import { HttpError } from '../http-error';
import { prisma } from '../prisma';
import { isChatImageOf } from './attachments';
import { findActiveAccount, type Participant } from './participants';
import {
  CHAT_MESSAGES_TOPIC,
  MAX_ATTACHMENTS,
  MAX_MESSAGE_LENGTH,
  isObjectId,
  newObjectId,
  parseMessageContent,
  parseParticipantKey,
  participantKey,
  type ChatEnvelope,
  type ChatMessage,
} from './protocol';
import { messageLimiter } from './rate-limit';

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
  /** Direct chats: the other person. */
  counterpart: Person | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
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

/** What a sender provides: text, photo URLs from their chat folder, or both. */
export type MessageInput = { body?: unknown; attachments?: unknown };

export const SUPPORT_TITLE = 'MlimaLink support';
const LIST_LIMIT = 50;
export const MESSAGES_PAGE_SIZE = 50;
const PREVIEW_LENGTH = 200;
/** Messages written per createMany. */
const INSERT_CHUNK = 500;

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

const keyOf = (person: Person) => participantKey(person.role, person.id);

function canAccess(viewer: Participant, row: ConversationRow): boolean {
  if (row.kind === 'direct') return row.participantKeys.includes(keyOf(viewer));
  if (viewer.role === 'user') return row.userId === viewer.id;
  if (viewer.role === 'seller') return row.sellerId === viewer.id;
  return row.kind === 'support';
}

function counterpartOf(
  viewer: Participant,
  row: ConversationRow,
): Person | null {
  if (row.kind !== 'direct') return null;
  const own = keyOf(viewer);
  return parseParticipantKey(row.participantKeys.find((key) => key !== own));
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

function toSummary(
  viewer: Participant,
  row: ConversationRow,
  names: Map<string, string>,
): ConversationSummary {
  return {
    id: row.id,
    kind: row.kind as ConversationKind,
    ...titleFor(viewer, row, names),
    userId: row.userId,
    sellerId: row.sellerId,
    shopId: row.shopId,
    counterpart: counterpartOf(viewer, row),
    lastMessage: row.lastMessage,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
  };
}

async function summarize(
  viewer: Participant,
  rows: ConversationRow[],
): Promise<ConversationSummary[]> {
  const names = await namesOf(
    rows.flatMap((row) => counterpartOf(viewer, row) ?? []),
  );
  return rows.map((row) => toSummary(viewer, row, names));
}

/**
 * The viewer's chats, most recently active first: their direct chats, plus their shop
 * and support chats. Admins see every support chat.
 */
export async function listConversations(
  viewer: Participant,
): Promise<ConversationSummary[]> {
  const ownChats =
    viewer.role === 'user'
      ? { userId: viewer.id }
      : viewer.role === 'seller'
        ? { sellerId: viewer.id }
        : { kind: 'support' };
  const rows = await prisma.conversations.findMany({
    where: {
      OR: [ownChats, { participantKeys: { has: keyOf(viewer) } }],
    },
    select: conversationSelect,
    orderBy: { updatedAt: 'desc' },
    take: LIST_LIMIT,
  });
  return summarize(viewer, rows);
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

async function resolveNewConversation(
  viewer: Participant,
  input: OpenConversationInput,
): Promise<NewConversation> {
  if (input.to !== undefined) {
    return resolveDirectConversation(viewer, input.to);
  }

  if (viewer.role === 'admin') {
    if (isObjectId(input.userId)) {
      const user = await prisma.users.findUnique({
        where: { id: input.userId },
        select: { id: true },
      });
      if (!user) throw new HttpError(404, 'Shopper not found.');
      return {
        key: `support:user:${user.id}`,
        kind: 'support',
        userId: user.id,
      };
    }
    if (isObjectId(input.sellerId)) {
      const seller = await prisma.sellers.findUnique({
        where: { id: input.sellerId },
        select: { id: true },
      });
      if (!seller) throw new HttpError(404, 'Seller not found.');
      return {
        key: `support:seller:${seller.id}`,
        kind: 'support',
        sellerId: seller.id,
      };
    }
    throw new HttpError(400, 'Choose a person, shopper or seller to message.');
  }

  if (input.support === true) {
    return viewer.role === 'user'
      ? { key: `support:user:${viewer.id}`, kind: 'support', userId: viewer.id }
      : {
          key: `support:seller:${viewer.id}`,
          kind: 'support',
          sellerId: viewer.id,
        };
  }

  if (viewer.role === 'user' && isObjectId(input.shopId)) {
    const shop = await prisma.shops.findUnique({
      where: { id: input.shopId },
      select: { id: true, sellerId: true },
    });
    if (!shop) throw new HttpError(404, 'Shop not found.');
    return {
      key: `shop:${shop.id}:${viewer.id}`,
      kind: 'shop',
      userId: viewer.id,
      sellerId: shop.sellerId,
      shopId: shop.id,
    };
  }

  throw new HttpError(
    400,
    viewer.role === 'user'
      ? 'Choose a person or shop to message, or ask support.'
      : 'Choose a person to message, or ask support.',
  );
}

const isUniqueViolation = (error: unknown) =>
  (error as { code?: unknown })?.code === 'P2002';

/** Finds the chat for this pair, creating it the first time. */
export async function openConversation(
  viewer: Participant,
  input: OpenConversationInput,
): Promise<ConversationSummary> {
  const { key, ...data } = await resolveNewConversation(viewer, input);
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

/** Up to MESSAGES_PAGE_SIZE messages before `before` (or the latest), oldest first. */
export async function listMessages(
  viewer: Participant,
  conversationId: string,
  before?: Date,
): Promise<ChatMessage[]> {
  await findAccessible(viewer, conversationId);
  const rows = await prisma.chat_messages.findMany({
    where: {
      conversationId,
      ...(before && { createdAt: { lt: before } }),
    },
    orderBy: { createdAt: 'desc' },
    take: MESSAGES_PAGE_SIZE,
  });
  return rows.reverse().map((row) => ({
    id: row.id,
    conversationId: row.conversationId,
    senderRole: row.senderRole as ChatMessage['senderRole'],
    senderId: row.senderId,
    senderName: row.senderName,
    body: row.body,
    attachments: row.attachments,
    createdAt: row.createdAt.toISOString(),
  }));
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
  const content = parseMessageContent(input.body, input.attachments);
  if (!content) {
    throw new HttpError(
      400,
      `Write a message of up to ${MAX_MESSAGE_LENGTH} characters, or attach up to ${MAX_ATTACHMENTS} photos.`,
    );
  }
  if (!content.attachments.every((url) => isChatImageOf(url, sender))) {
    throw new HttpError(400, 'Upload photos through chat before sending them.');
  }
  if (!(await messageLimiter().take(keyOf(sender)))) {
    throw new HttpError(
      429,
      'You’re sending messages too fast. Wait a moment and try again.',
    );
  }
  const row = await findAccessible(sender, conversationId);

  const now = Date.now();
  const message: ChatMessage = {
    id: newObjectId(now),
    conversationId: row.id,
    senderRole: sender.role,
    senderId: sender.id,
    senderName: sender.name,
    ...content,
    createdAt: new Date(now).toISOString(),
  };
  const envelope: ChatEnvelope = {
    message,
    audience: {
      ...(row.userId && { userId: row.userId }),
      ...(row.sellerId && { sellerId: row.sellerId }),
      ...(row.kind === 'direct' && { participants: row.participantKeys }),
      support: row.kind === 'support',
    },
  };

  try {
    const producer = await getProducer();
    await producer.send({
      topic: CHAT_MESSAGES_TOPIC,
      messages: [{ key: row.id, value: JSON.stringify(envelope) }],
    });
  } catch {
    throw new HttpError(
      503,
      'Chat is unavailable right now. Please try again in a moment.',
    );
  }
  return message;
}

/** What chat lists show for a message. */
export function previewOf({ body, attachments }: ChatMessage): string {
  if (body) return body.slice(0, PREVIEW_LENGTH);
  return attachments.length === 1
    ? 'Sent a photo'
    : `Sent ${attachments.length} photos`;
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
        ...message,
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
