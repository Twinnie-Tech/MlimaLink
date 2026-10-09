import { randomBytes } from 'node:crypto';
import { isAccountType, type AccountType } from '@org/utils/auth';

/** Every chat message goes through this topic, keyed by conversation so each chat stays in order. */
export const CHAT_MESSAGES_TOPIC = 'chat_messages';

export const MAX_MESSAGE_LENGTH = 2000;

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderRole: AccountType;
  senderId: string;
  senderName: string;
  body: string;
  /** ISO date string. */
  createdAt: string;
}

/** Who receives a message live. Support chats go to every connected admin. */
export interface ChatAudience {
  userId?: string;
  sellerId?: string;
  support: boolean;
}

/** What's published to the chat_messages topic. */
export interface ChatEnvelope {
  message: ChatMessage;
  audience: ChatAudience;
}

const OBJECT_ID = /^[a-f\d]{24}$/i;

export const isObjectId = (value: unknown): value is string =>
  typeof value === 'string' && OBJECT_ID.test(value);

/** A MongoDB ObjectId made here, so a message has its id before it reaches Kafka. */
export function newObjectId(now = Date.now()): string {
  const seconds = Math.floor(now / 1000)
    .toString(16)
    .padStart(8, '0');
  return seconds + randomBytes(8).toString('hex');
}

/** The trimmed message text, or null when it's empty or too long. */
export function parseMessageBody(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const body = value.trim();
  return body && body.length <= MAX_MESSAGE_LENGTH ? body : null;
}

const optionalId = (value: unknown) => value === undefined || isObjectId(value);

/** Reads a message from the chat_messages topic; null when it isn't a valid envelope. */
export function parseChatEnvelope(
  raw: string | undefined,
): ChatEnvelope | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const { message, audience } = (data ?? {}) as Partial<
    Record<keyof ChatEnvelope, Record<string, unknown>>
  >;
  if (!message || !audience) return null;

  const { id, conversationId, senderRole, senderId, senderName, createdAt } =
    message;
  const body = parseMessageBody(message.body);
  if (
    !isObjectId(id) ||
    !isObjectId(conversationId) ||
    !isAccountType(senderRole) ||
    !isObjectId(senderId) ||
    typeof senderName !== 'string' ||
    body === null ||
    typeof createdAt !== 'string' ||
    Number.isNaN(Date.parse(createdAt))
  ) {
    return null;
  }
  if (
    typeof audience.support !== 'boolean' ||
    !optionalId(audience.userId) ||
    !optionalId(audience.sellerId)
  ) {
    return null;
  }

  return {
    message: {
      id,
      conversationId,
      senderRole,
      senderId,
      senderName,
      body,
      createdAt,
    },
    audience: {
      ...(audience.userId ? { userId: audience.userId as string } : {}),
      ...(audience.sellerId ? { sellerId: audience.sellerId as string } : {}),
      support: audience.support,
    },
  };
}
