import { getProducer } from '@org/utils/kafka';
import { HttpError } from '../http-error';
import { prisma } from '../prisma';
import type { Participant } from './participants';
import {
  CHAT_MESSAGES_TOPIC,
  isObjectId,
  newObjectId,
  parseMessageBody,
  type ChatEnvelope,
  type ChatMessage,
} from './protocol';

export type ConversationKind = 'shop' | 'support';

/** A chat as one participant sees it in their list. */
export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  /** Who the viewer is talking to. */
  title: string;
  /** For admins: "Shopper" or "Seller". */
  subtitle: string | null;
  userId: string | null;
  sellerId: string | null;
  shopId: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

/** Start or resume a chat: shoppers name a shop, shoppers and sellers can ask support, and admins name a shopper or seller. */
export type OpenConversationInput = {
  shopId?: unknown;
  support?: unknown;
  userId?: unknown;
  sellerId?: unknown;
};

export const SUPPORT_TITLE = 'MlimaLink support';
const LIST_LIMIT = 50;
export const MESSAGES_PAGE_SIZE = 50;
const PREVIEW_LENGTH = 200;

const conversationSelect = {
  id: true,
  kind: true,
  userId: true,
  sellerId: true,
  shopId: true,
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
  lastMessage: string | null;
  lastMessageAt: Date | null;
  user: { name: string } | null;
  seller: { name: string } | null;
  shop: { name: string } | null;
};

const notFound = () => new HttpError(404, 'Conversation not found.');

function canAccess(viewer: Participant, row: ConversationRow): boolean {
  if (viewer.role === 'user') return row.userId === viewer.id;
  if (viewer.role === 'seller') return row.sellerId === viewer.id;
  return row.kind === 'support';
}

function titleFor(
  viewer: Participant,
  row: ConversationRow,
): Pick<ConversationSummary, 'title' | 'subtitle'> {
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
): ConversationSummary {
  return {
    id: row.id,
    kind: row.kind as ConversationKind,
    ...titleFor(viewer, row),
    userId: row.userId,
    sellerId: row.sellerId,
    shopId: row.shopId,
    lastMessage: row.lastMessage,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
  };
}

/** The viewer's chats, most recently active first. Admins see every support chat. */
export async function listConversations(
  viewer: Participant,
): Promise<ConversationSummary[]> {
  const where =
    viewer.role === 'user'
      ? { userId: viewer.id }
      : viewer.role === 'seller'
        ? { sellerId: viewer.id }
        : { kind: 'support' };
  const rows = await prisma.conversations.findMany({
    where,
    select: conversationSelect,
    orderBy: { updatedAt: 'desc' },
    take: LIST_LIMIT,
  });
  return rows.map((row) => toSummary(viewer, row));
}

type NewConversation = {
  key: string;
  kind: ConversationKind;
  userId?: string;
  sellerId?: string;
  shopId?: string;
};

async function resolveNewConversation(
  viewer: Participant,
  input: OpenConversationInput,
): Promise<NewConversation> {
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
    throw new HttpError(400, 'Choose a shopper or seller to message.');
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
      ? 'Choose a shop to message, or ask support.'
      : 'Sellers can reply to shoppers or ask support.',
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
  try {
    const row = await prisma.conversations.upsert({
      where: { key },
      create: { key, ...data },
      update: {},
      select: conversationSelect,
    });
    return toSummary(viewer, row);
  } catch (error) {
    // Two first messages at once: the other request created it.
    if (!isUniqueViolation(error)) throw error;
    const row = await prisma.conversations.findUniqueOrThrow({
      where: { key },
      select: conversationSelect,
    });
    return toSummary(viewer, row);
  }
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
  rawBody: unknown,
): Promise<ChatMessage> {
  const body = parseMessageBody(rawBody);
  if (body === null) {
    throw new HttpError(400, 'Write a message of up to 2000 characters.');
  }
  const row = await findAccessible(sender, conversationId);

  const now = Date.now();
  const message: ChatMessage = {
    id: newObjectId(now),
    conversationId: row.id,
    senderRole: sender.role,
    senderId: sender.id,
    senderName: sender.name,
    body,
    createdAt: new Date(now).toISOString(),
  };
  const envelope: ChatEnvelope = {
    message,
    audience: {
      ...(row.userId && { userId: row.userId }),
      ...(row.sellerId && { sellerId: row.sellerId }),
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

/** Writes a message from the topic, once even when Kafka delivers it again. */
export async function storeMessage(message: ChatMessage): Promise<void> {
  const createdAt = new Date(message.createdAt);
  await prisma.chat_messages.upsert({
    where: { id: message.id },
    create: { ...message, createdAt },
    update: {},
  });
  // updateMany, so a message for a deleted chat is skipped instead of retried forever.
  await prisma.conversations.updateMany({
    where: { id: message.conversationId },
    data: {
      lastMessage: message.body.slice(0, PREVIEW_LENGTH),
      lastMessageAt: createdAt,
    },
  });
}
