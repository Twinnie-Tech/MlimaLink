import { randomBytes } from 'node:crypto';
import { isAccountType, type AccountType } from '@org/utils/auth';

/** Every chat message goes through this topic, keyed by conversation so each chat stays in order. */
export const CHAT_MESSAGES_TOPIC = 'chat_messages';

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_ATTACHMENTS = 4;
const MAX_URL_LENGTH = 2048;

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderRole: AccountType;
  senderId: string;
  senderName: string;
  /** May be empty when the message is only photos. */
  body: string;
  /** Photo URLs on ImageKit. */
  attachments: string[];
  /** ISO date string. */
  createdAt: string;
}

/**
 * Who receives a message live. Support chats go to every connected admin; direct chats
 * go to each participant key ("<role>:<id>").
 */
export interface ChatAudience {
  userId?: string;
  sellerId?: string;
  participants?: string[];
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

/** How a person is named in direct chats and in the hub: "<role>:<id>". */
export const participantKey = (role: AccountType, id: string) =>
  `${role}:${id}`;

export function parseParticipantKey(
  value: unknown,
): { role: AccountType; id: string } | null {
  if (typeof value !== 'string') return null;
  const [role, id, ...rest] = value.split(':');
  return rest.length === 0 && isAccountType(role) && isObjectId(id)
    ? { role, id }
    : null;
}

/** Up to MAX_ATTACHMENTS distinct https URLs; missing means none. Null when invalid. */
export function parseAttachmentList(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) return null;
  const urls = value.filter(
    (url): url is string =>
      typeof url === 'string' &&
      url.length <= MAX_URL_LENGTH &&
      url.startsWith('https://'),
  );
  return urls.length === value.length && new Set(urls).size === urls.length
    ? urls
    : null;
}

/** Text, photos or both; null when there's neither or either is invalid. */
export function parseMessageContent(
  rawBody: unknown,
  rawAttachments: unknown,
): { body: string; attachments: string[] } | null {
  const attachments = parseAttachmentList(rawAttachments);
  if (!attachments) return null;
  const body =
    rawBody === undefined || rawBody === null
      ? ''
      : typeof rawBody === 'string'
        ? rawBody.trim()
        : null;
  if (body === null || body.length > MAX_MESSAGE_LENGTH) return null;
  return body || attachments.length ? { body, attachments } : null;
}

const optionalId = (value: unknown) => value === undefined || isObjectId(value);

function parseAudienceParticipants(
  value: unknown,
): string[] | null | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) &&
    value.length <= 2 &&
    value.every((key) => parseParticipantKey(key))
    ? (value as string[])
    : null;
}

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
  const content = parseMessageContent(message.body, message.attachments);
  if (
    !isObjectId(id) ||
    !isObjectId(conversationId) ||
    !isAccountType(senderRole) ||
    !isObjectId(senderId) ||
    typeof senderName !== 'string' ||
    !content ||
    typeof createdAt !== 'string' ||
    Number.isNaN(Date.parse(createdAt))
  ) {
    return null;
  }
  const participants = parseAudienceParticipants(audience.participants);
  if (
    typeof audience.support !== 'boolean' ||
    !optionalId(audience.userId) ||
    !optionalId(audience.sellerId) ||
    participants === null
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
      ...content,
      createdAt,
    },
    audience: {
      ...(audience.userId ? { userId: audience.userId as string } : {}),
      ...(audience.sellerId ? { sellerId: audience.sellerId as string } : {}),
      ...(participants ? { participants } : {}),
      support: audience.support,
    },
  };
}
