/** Shapes shared by chatting-service and the chat screens in user-ui and seller-ui. */

export type ChatRole = 'user' | 'seller' | 'admin';

export type ChatPerson = { role: ChatRole; id: string };

export type ConversationKind = 'shop' | 'support' | 'direct';

/**
 * Like Microsoft Teams. Everyone is available, away (idle for a few minutes) or offline;
 * admins can also set busy, do not disturb or be right back by hand.
 */
export type PresenceStatus =
  'available' | 'busy' | 'dnd' | 'brb' | 'away' | 'offline';

/** What a connected tab reports when the person goes idle or comes back. */
export type ActivePresenceStatus = 'available' | 'away';

/** What an admin can set by hand; "offline" is appear offline. Null goes back to automatic. */
export type ManualPresenceStatus = 'busy' | 'dnd' | 'brb' | 'away' | 'offline';

export interface Presence {
  status: PresenceStatus;
  /** When they were last connected; null if never. ISO date string. */
  lastSeenAt: string | null;
}

/** A shared document. */
export interface ChatFile {
  url: string;
  name: string;
  /** Bytes. */
  size: number;
  mimeType: string;
}

/** A GIF or sticker from GIPHY. */
export interface ChatGif {
  kind: 'gif' | 'sticker';
  url: string;
  width: number;
  height: number;
  title: string;
}

/** The message being answered, as it read when quoted. */
export interface ChatReply {
  id: string;
  senderName: string;
  preview: string;
}

export interface ChatReaction {
  emoji: string;
  /** `personKey` of who reacted. */
  key: string;
  name: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderRole: ChatRole;
  senderId: string;
  senderName: string;
  /** May be empty when the message is only photos, documents or a GIF. */
  body: string;
  /** Photo URLs. */
  attachments: string[];
  files: ChatFile[];
  gif: ChatGif | null;
  replyTo: ChatReply | null;
  /** At most one per person. */
  reactions: ChatReaction[];
  /** ISO date strings. */
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

/** What the upload endpoint returns; photos go in `attachments`, documents in `files`. */
export interface ChatUpload {
  url: string;
  fileId: string;
  kind: 'photo' | 'document';
  name: string;
  size: number;
  mimeType: string;
}

/** One GIPHY search result. */
export interface GifResult {
  id: string;
  title: string;
  /** What gets sent. */
  url: string;
  width: number;
  height: number;
  /** A smaller version for the picker. */
  previewUrl: string;
}

export interface GifPage {
  results: GifResult[];
  /** Pass as `offset` for more; null when there are no more. */
  next: number | null;
}

/** A chat as one participant sees it in their list. */
export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  /** Who the viewer is talking to. */
  title: string;
  subtitle: string | null;
  userId: string | null;
  sellerId: string | null;
  shopId: string | null;
  participants: ChatPerson[];
  /** Null for shoppers and sellers in support chats, where admins answer as a team. */
  counterpart: ChatPerson | null;
  presence: Presence | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unseenCount: number;
}

/** One page of a chat, newest message first. */
export interface MessagePage {
  messages: ChatMessage[];
  hasMore: boolean;
  /** Pass as `cursor` to get the next, older page. */
  nextCursor: string | null;
  /** Set when this request marked the chat as read. ISO date string. */
  lastReadAt: string | null;
  /**
   * First page only: how far the other side has read, so the viewer's messages up to
   * then show as seen. In support chats that's any admin for shoppers and sellers, and
   * the shopper or seller for admins. ISO date string.
   */
  seenAt: string | null;
}

/** Exactly one of these starts or resumes a chat. */
export type OpenConversationRequest =
  | { shopId: string }
  | { support: true }
  | { to: ChatPerson }
  | { userId: string }
  | { sellerId: string };

/** Someone's status, keyed by `personKey`. */
export type PresenceUpdate = Presence & { key: string };

/** What a message carries besides text; GIF messages carry nothing else. */
export type MessageContent = {
  body: string;
  attachments?: string[];
  files?: ChatFile[];
  gif?: ChatGif;
  /** The id of the message being answered. */
  replyToId?: string;
};

export type ChatClientEvent =
  | ({
      type: 'send';
      conversationId: string;
      clientId?: string;
    } & MessageContent)
  | { type: 'read'; conversationId: string }
  | { type: 'presence'; status: ActivePresenceStatus }
  /** Asks for the status of everyone you chat with, now and whenever it changes. */
  | { type: 'watch' }
  /** Sent every few seconds while typing. */
  | { type: 'typing'; conversationId: string }
  /** Admins only. */
  | { type: 'status'; status: ManualPresenceStatus | null };

export type ChatServerEvent =
  | { type: 'ready'; you: ChatPerson & { name: string } }
  | { type: 'sent'; clientId?: string; message: ChatMessage }
  | { type: 'error'; clientId?: string; message: string }
  | { type: 'message'; message: ChatMessage }
  /** A message was edited, deleted or reacted to; replace it. */
  | { type: 'updated'; message: ChatMessage }
  | { type: 'read'; conversationId: string; lastReadAt: string }
  /** Someone read the chat up to `lastReadAt`; `reader` is their person key. */
  | { type: 'seen'; conversationId: string; reader: string; lastReadAt: string }
  | {
      type: 'typing';
      conversationId: string;
      from: { key: string; name: string };
    }
  | { type: 'presence'; updates: PresenceUpdate[] }
  /** An admin's own status set by hand, for all their tabs; null when automatic. */
  | { type: 'status'; manual: ManualPresenceStatus | null };

/** How chatting-service names a person: "<role>:<id>". */
export const personKey = ({ role, id }: ChatPerson) => `${role}:${id}`;

export const CHAT_MAX_MESSAGE_LENGTH = 2000;
/** Photos and documents together, per message. */
export const CHAT_MAX_ATTACHMENTS = 4;
/** The most a photo or document may weigh. */
export const CHAT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const CHAT_PHOTO_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];
/** Documents that can be shared, by file extension. */
export const CHAT_DOCUMENT_TYPES: Record<string, string> = {
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
/** For the file picker. */
export const CHAT_FILE_ACCEPT = [
  ...CHAT_PHOTO_TYPES,
  ...Object.keys(CHAT_DOCUMENT_TYPES).map((extension) => `.${extension}`),
].join(',');
/** Shown under each message for a quick reaction; any emoji works. */
export const CHAT_QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
/** How long "typing…" shows after the last typing event. */
export const CHAT_TYPING_SHOWS_MS = 6_000;
/** How often a typing tab says so. */
export const CHAT_TYPING_EVERY_MS = 3_000;
export const CHAT_DELETED_TEXT = 'This message was deleted';
/** Messages per page; the newest page is what opens when a chat is selected. */
export const CHAT_PAGE_SIZE = 20;
/** The socket closes with this code when the access token runs out. */
export const CHAT_SESSION_EXPIRED_CODE = 4001;
/** Teams shows someone as away after five idle minutes. */
export const CHAT_IDLE_AFTER_MS = 5 * 60_000;

const SERVER_EVENT_TYPES = new Set([
  'ready',
  'sent',
  'error',
  'message',
  'updated',
  'read',
  'seen',
  'typing',
  'presence',
  'status',
]);

/** Null for anything that isn't a JSON object with a known `type`. */
export function parseChatServerEvent(data: unknown): ChatServerEvent | null {
  if (typeof data !== 'string') return null;
  try {
    const parsed = JSON.parse(data) as { type?: unknown } | null;
    return parsed &&
      typeof parsed.type === 'string' &&
      SERVER_EVENT_TYPES.has(parsed.type)
      ? (parsed as ChatServerEvent)
      : null;
  } catch {
    return null;
  }
}

/** Badge text: nothing for zero, "99+" past 99. */
export function formatUnseen(count: number): string {
  if (count <= 0) return '';
  return count > 99 ? '99+' : String(count);
}

export const isOwnMessage = (message: ChatMessage, me: ChatPerson) =>
  message.senderRole === me.role && message.senderId === me.id;

/** What chat lists and notifications show for a message; matches chatting-service. */
export function messagePreview(
  message: Pick<
    ChatMessage,
    'body' | 'attachments' | 'files' | 'gif' | 'deletedAt'
  >,
): string {
  const { body, attachments, deletedAt } = message;
  const files = message.files ?? [];
  if (deletedAt) return CHAT_DELETED_TEXT;
  if (body) return body;
  if (message.gif) {
    return message.gif.kind === 'sticker' ? 'Sent a sticker' : 'Sent a GIF';
  }
  if (files.length && attachments.length) {
    return `Sent ${files.length + attachments.length} attachments`;
  }
  if (files.length === 1) return `📄 ${files[0].name}`;
  if (files.length) return `Sent ${files.length} documents`;
  return attachments.length === 1
    ? 'Sent a photo'
    : `Sent ${attachments.length} photos`;
}

/**
 * Whether `reader` reading a chat counts as the viewer's messages being seen: anyone
 * else, except that in support chats admins answer as a team, so another admin reading
 * doesn't count for an admin.
 */
export function isOtherSide(me: ChatPerson, reader: string): boolean {
  if (reader === personKey(me)) return false;
  return !(me.role === 'admin' && reader.startsWith('admin:'));
}

/** "850 KB", "2.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
}

const extensionOf = (name: string) =>
  /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';

/** "photo" or "document" for a file that can be shared, otherwise null. */
export function chatFileKind(file: {
  name: string;
  type: string;
}): 'photo' | 'document' | null {
  if (CHAT_PHOTO_TYPES.includes(file.type)) return 'photo';
  return extensionOf(file.name) in CHAT_DOCUMENT_TYPES ? 'document' : null;
}

/** Why a file can't be shared, in words for the person picking it; null when it can. */
export function chatFileProblem(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (!chatFileKind(file)) {
    return `“${file.name}” can’t be shared. Send photos (JPEG, PNG, WebP or GIF) or documents (PDF, Word, Excel, PowerPoint, text or CSV).`;
  }
  if (file.size > CHAT_MAX_FILE_BYTES) {
    return `“${file.name}” is ${formatBytes(file.size)}, which is over the 10 MB limit. Please compress it to under 10 MB and try again.`;
  }
  if (file.size === 0) return `“${file.name}” is empty.`;
  return null;
}

const byTimeThenId = (a: ChatMessage, b: ChatMessage) =>
  a.createdAt === b.createdAt
    ? a.id.localeCompare(b.id)
    : Date.parse(a.createdAt) - Date.parse(b.createdAt);

/** Combines pages and live messages into one oldest-first list without duplicates. */
export function mergeMessages(
  current: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(byTimeThenId);
}

function ago(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export const PRESENCE_LABELS: Record<
  Exclude<PresenceStatus, 'offline'>,
  string
> = {
  available: 'Available',
  busy: 'Busy',
  dnd: 'Do not disturb',
  brb: 'Be right back',
  away: 'Away',
};

/** "Available", "Busy", "Away", "Last seen 5 min ago" or "Offline", as Teams shows it. */
export function presenceLabel(
  presence: Presence | null,
  now = Date.now(),
): string {
  if (!presence) return '';
  if (presence.status !== 'offline') return PRESENCE_LABELS[presence.status];
  return presence.lastSeenAt
    ? `Last seen ${ago(presence.lastSeenAt, now)}`
    : 'Offline';
}

/** Time for today's messages, otherwise the date. */
export function chatTimeLabel(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}
