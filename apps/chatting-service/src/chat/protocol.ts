import { randomBytes } from 'node:crypto';
import { isAccountType, type AccountType } from '@org/utils/auth';

/**
 * Every chat message goes through this topic, keyed by conversation so each chat stays
 * in order, along with edits, read receipts and typing, which are only delivered.
 */
export const CHAT_MESSAGES_TOPIC = 'chat_messages';

export const MAX_MESSAGE_LENGTH = 2000;
/** Photos and documents together. */
export const MAX_ATTACHMENTS = 4;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_REACTIONS = 50;
export const DELETED_TEXT = 'This message was deleted';
const MAX_URL_LENGTH = 2048;
const MAX_NAME_LENGTH = 200;
const MAX_PREVIEW_LENGTH = 200;

/** Documents that can be shared, by file extension. */
export const DOCUMENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
};
const DOCUMENT_MIME_TYPES = new Set(Object.values(DOCUMENT_TYPES));

export interface ChatFile {
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface ChatGif {
  kind: 'gif' | 'sticker';
  url: string;
  width: number;
  height: number;
  title: string;
}

export interface ChatReply {
  id: string;
  senderName: string;
  preview: string;
}

export interface ChatReaction {
  emoji: string;
  /** "<role>:<id>" of who reacted. */
  key: string;
  name: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderRole: AccountType;
  senderId: string;
  senderName: string;
  /** May be empty when the message is only photos, documents or a GIF. */
  body: string;
  /** Photo URLs on ImageKit. */
  attachments: string[];
  /** Documents on ImageKit. */
  files: ChatFile[];
  gif: ChatGif | null;
  replyTo: ChatReply | null;
  reactions: ChatReaction[];
  /** ISO date strings. */
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

/** What a sender writes; the rest of a message is filled in by the server. */
export type MessageContent = Pick<
  ChatMessage,
  'body' | 'attachments' | 'files' | 'gif'
>;

/**
 * Who receives an event live. Support chats go to every connected admin; direct chats
 * go to each participant key ("<role>:<id>").
 */
export interface ChatAudience {
  userId?: string;
  sellerId?: string;
  participants?: string[];
  support: boolean;
}

/**
 * What's published to the chat_messages topic. Only new messages are stored from it;
 * edits are written before they're published, and seen and typing are only delivered.
 */
export type ChatEnvelope =
  | { type: 'message'; message: ChatMessage; audience: ChatAudience }
  | { type: 'updated'; message: ChatMessage; audience: ChatAudience }
  | {
      type: 'seen';
      conversationId: string;
      /** Who read it, as "<role>:<id>". */
      reader: string;
      lastReadAt: string;
      audience: ChatAudience;
    }
  | {
      type: 'typing';
      conversationId: string;
      from: { key: string; name: string };
      audience: ChatAudience;
    };

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

const isHttpsUrl = (url: unknown): url is string =>
  typeof url === 'string' &&
  url.length <= MAX_URL_LENGTH &&
  url.startsWith('https://');

const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;

const isDimension = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) > 0 && (value as number) <= 4000;

/** Up to MAX_ATTACHMENTS distinct https URLs; missing means none. Null when invalid. */
export function parseAttachmentList(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) return null;
  const urls = value.filter(isHttpsUrl);
  return urls.length === value.length && new Set(urls).size === urls.length
    ? urls
    : null;
}

/** Up to MAX_ATTACHMENTS documents; missing means none. Null when invalid. */
export function parseFileList(value: unknown): ChatFile[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) return null;
  const files: ChatFile[] = [];
  for (const item of value) {
    const { url, name, size, mimeType } = (item ?? {}) as Record<
      string,
      unknown
    >;
    if (
      !isHttpsUrl(url) ||
      !isText(name, MAX_NAME_LENGTH) ||
      !name.trim() ||
      !Number.isInteger(size) ||
      (size as number) < 1 ||
      (size as number) > MAX_FILE_BYTES ||
      typeof mimeType !== 'string' ||
      !DOCUMENT_MIME_TYPES.has(mimeType)
    ) {
      return null;
    }
    files.push({ url, name: name.trim(), size: size as number, mimeType });
  }
  return new Set(files.map((file) => file.url)).size === files.length
    ? files
    : null;
}

/** GIPHY serves GIFs and stickers from media*.giphy.com and i.giphy.com. */
export function isGiphyUrl(url: unknown): url is string {
  if (!isHttpsUrl(url)) return false;
  try {
    return /^(media\d*|i)\.giphy\.com$/.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Missing is null; undefined when present but invalid. */
export function parseGif(value: unknown): ChatGif | null | undefined {
  if (value === undefined || value === null) return null;
  const { kind, url, width, height, title } = (value ?? {}) as Record<
    string,
    unknown
  >;
  if (
    (kind !== 'gif' && kind !== 'sticker') ||
    !isGiphyUrl(url) ||
    !isDimension(width) ||
    !isDimension(height) ||
    !isText(title, MAX_NAME_LENGTH)
  ) {
    return undefined;
  }
  return { kind, url, width, height, title };
}

/**
 * Text, photos, documents or a mix, or a GIF on its own; null when there's nothing to
 * send or anything is invalid.
 */
export function parseMessageContent(input: {
  body?: unknown;
  attachments?: unknown;
  files?: unknown;
  gif?: unknown;
}): MessageContent | null {
  const attachments = parseAttachmentList(input.attachments);
  const files = parseFileList(input.files);
  const gif = parseGif(input.gif);
  if (!attachments || !files || gif === undefined) return null;
  if (attachments.length + files.length > MAX_ATTACHMENTS) return null;
  const body =
    input.body === undefined || input.body === null
      ? ''
      : typeof input.body === 'string'
        ? input.body.trim()
        : null;
  if (body === null || body.length > MAX_MESSAGE_LENGTH) return null;
  if (gif) {
    return body || attachments.length || files.length
      ? null
      : { body, attachments, files, gif };
  }
  return body || attachments.length || files.length
    ? { body, attachments, files, gif: null }
    : null;
}

/** What chat lists show for a message. */
export function previewOf(
  message: Pick<
    ChatMessage,
    'body' | 'attachments' | 'files' | 'gif' | 'deletedAt'
  >,
): string {
  const { body, attachments, files, gif, deletedAt } = message;
  if (deletedAt) return DELETED_TEXT;
  if (body) return body.slice(0, MAX_PREVIEW_LENGTH);
  if (gif) return gif.kind === 'sticker' ? 'Sent a sticker' : 'Sent a GIF';
  if (files.length && attachments.length) {
    return `Sent ${files.length + attachments.length} attachments`;
  }
  if (files.length === 1) return `📄 ${files[0].name}`;
  if (files.length) return `Sent ${files.length} documents`;
  return attachments.length === 1
    ? 'Sent a photo'
    : `Sent ${attachments.length} photos`;
}

function parseReply(value: unknown): ChatReply | null | undefined {
  if (value === undefined || value === null) return null;
  const { id, senderName, preview } = value as Record<string, unknown>;
  return isObjectId(id) &&
    isText(senderName, MAX_NAME_LENGTH) &&
    isText(preview, MAX_PREVIEW_LENGTH)
    ? { id, senderName, preview }
    : undefined;
}

function parseReactions(value: unknown): ChatReaction[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_REACTIONS) return null;
  const reactions: ChatReaction[] = [];
  for (const item of value) {
    const { emoji, key, name } = (item ?? {}) as Record<string, unknown>;
    if (!isText(emoji, 32) || !parseParticipantKey(key) || !isText(name, 200)) {
      return null;
    }
    reactions.push({ emoji, key: key as string, name });
  }
  return reactions;
}

const optionalDate = (value: unknown): string | null | undefined =>
  value === undefined || value === null
    ? null
    : typeof value === 'string' && !Number.isNaN(Date.parse(value))
      ? value
      : undefined;

/** A whole message from the topic, including deleted ones (which have no content). */
function parseMessage(raw: Record<string, unknown>): ChatMessage | null {
  const { id, conversationId, senderRole, senderId, senderName, createdAt } =
    raw;
  const deletedAt = optionalDate(raw.deletedAt);
  const editedAt = optionalDate(raw.editedAt);
  const content: MessageContent | null = deletedAt
    ? { body: '', attachments: [], files: [], gif: null }
    : parseMessageContent(raw);
  const replyTo = parseReply(raw.replyTo);
  const reactions = parseReactions(raw.reactions);
  if (
    !isObjectId(id) ||
    !isObjectId(conversationId) ||
    !isAccountType(senderRole) ||
    !isObjectId(senderId) ||
    typeof senderName !== 'string' ||
    !content ||
    replyTo === undefined ||
    !reactions ||
    deletedAt === undefined ||
    editedAt === undefined ||
    typeof createdAt !== 'string' ||
    Number.isNaN(Date.parse(createdAt))
  ) {
    return null;
  }
  return {
    id,
    conversationId,
    senderRole,
    senderId,
    senderName,
    ...content,
    replyTo,
    reactions,
    editedAt,
    deletedAt,
    createdAt,
  };
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

function parseAudience(
  audience: Record<string, unknown> | undefined,
): ChatAudience | null {
  if (!audience) return null;
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
    ...(audience.userId ? { userId: audience.userId as string } : {}),
    ...(audience.sellerId ? { sellerId: audience.sellerId as string } : {}),
    ...(participants ? { participants } : {}),
    support: audience.support,
  };
}

/** Reads an event from the chat_messages topic; null when it isn't a valid envelope. */
export function parseChatEnvelope(
  raw: string | undefined,
): ChatEnvelope | null {
  if (!raw) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) ?? {};
  } catch {
    return null;
  }
  const audience = parseAudience(
    data.audience as Record<string, unknown> | undefined,
  );
  if (!audience) return null;
  // Messages published before there were other kinds have no type.
  const type = data.type ?? 'message';

  if (type === 'message' || type === 'updated') {
    const message =
      data.message && typeof data.message === 'object'
        ? parseMessage(data.message as Record<string, unknown>)
        : null;
    return message ? { type, message, audience } : null;
  }
  const { conversationId } = data;
  if (!isObjectId(conversationId)) return null;
  if (type === 'seen') {
    const { reader, lastReadAt } = data;
    return parseParticipantKey(reader) &&
      typeof lastReadAt === 'string' &&
      !Number.isNaN(Date.parse(lastReadAt))
      ? {
          type,
          conversationId,
          reader: reader as string,
          lastReadAt,
          audience,
        }
      : null;
  }
  if (type === 'typing') {
    const { key, name } = (data.from ?? {}) as Record<string, unknown>;
    return parseParticipantKey(key) && isText(name, 200)
      ? {
          type,
          conversationId,
          from: { key: key as string, name },
          audience,
        }
      : null;
  }
  return null;
}
