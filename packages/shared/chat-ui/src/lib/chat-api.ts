import type {
  ChatMessage,
  ChatRole,
  ChatUpload,
  ConversationSummary,
  GifPage,
  MessageContent,
  MessagePage,
  OpenConversationRequest,
} from '@org/models/chat';

export class ChatRequestError extends Error {
  /** HTTP status, or 0 when the server could not be reached. */
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ChatRequestError';
  }
}

export type ChatApiOptions = {
  /** Which signed-in account is chatting; each UI has its own cookie. */
  account: ChatRole;
  /** Renews an expired access token; called once before retrying a 401. */
  refreshSession: () => Promise<unknown>;
};

export type ChatApi = ReturnType<typeof createChatApi>;

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** A JSON value, or a file sent as the body itself. */
type Body = { json: unknown } | { file: File } | undefined;

function fallbackMessage(status: number): string {
  if (status === 413) {
    return 'That file is over the 10 MB limit. Please compress it to under 10 MB and try again.';
  }
  return status >= 500
    ? 'Chat is unavailable right now. Please try again later.'
    : 'Something went wrong. Please try again.';
}

/** Client for chatting-service, reached through the API gateway at /api/chat. */
export function createChatApi({ account, refreshSession }: ChatApiOptions) {
  async function send<T>(method: Method, path: string, body: Body): Promise<T> {
    const separator = path.includes('?') ? '&' : '?';
    let response: Response;
    try {
      response = await fetch(`/api/chat/${path}${separator}as=${account}`, {
        method,
        headers:
          body === undefined
            ? undefined
            : {
                'Content-Type':
                  'file' in body
                    ? body.file.type || 'application/octet-stream'
                    : 'application/json',
              },
        credentials: 'include',
        body:
          body === undefined
            ? undefined
            : 'file' in body
              ? body.file
              : JSON.stringify(body.json),
      });
    } catch {
      throw new ChatRequestError(
        'Could not reach the server. Check your connection and try again.',
        0,
      );
    }
    const data = (await response.json().catch(() => null)) as
      (T & { message?: string }) | null;
    if (!response.ok) {
      throw new ChatRequestError(
        data?.message ?? fallbackMessage(response.status),
        response.status,
      );
    }
    return data as T;
  }

  async function request<T>(
    method: Method,
    path: string,
    body?: Body,
  ): Promise<T> {
    try {
      return await send<T>(method, path, body);
    } catch (error) {
      if (!(error instanceof ChatRequestError) || error.status !== 401) {
        throw error;
      }
    }
    try {
      await refreshSession();
    } catch {
      throw new ChatRequestError(
        'Your session has ended. Please sign in again.',
        401,
      );
    }
    return send<T>(method, path, body);
  }

  const chat = (id: string) => `conversations/${encodeURIComponent(id)}`;
  const message = (id: string, messageId: string) =>
    `${chat(id)}/messages/${encodeURIComponent(messageId)}`;

  return {
    account,
    refreshSession,
    listConversations: () =>
      request<ConversationSummary[]>('GET', 'conversations'),
    getConversation: (id: string) =>
      request<ConversationSummary>('GET', chat(id)),
    openConversation: (body: OpenConversationRequest) =>
      request<ConversationSummary>('POST', 'conversations', { json: body }),
    /** Newest first; reading the first page also marks the chat as read. */
    listMessages: (id: string, cursor?: string) =>
      request<MessagePage>(
        'GET',
        `${chat(id)}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      ),
    sendMessage: (id: string, content: MessageContent) =>
      request<ChatMessage>('POST', `${chat(id)}/messages`, { json: content }),
    /** Your own messages only, any time; they show as edited. */
    editMessage: (id: string, messageId: string, body: string) =>
      request<ChatMessage>('PATCH', message(id, messageId), {
        json: { body },
      }),
    /** Removes your own message for everyone. */
    deleteMessage: (id: string, messageId: string) =>
      request<ChatMessage>('DELETE', message(id, messageId)),
    /** Adds your reaction, swaps it, or takes it away when it's the same emoji. */
    react: (id: string, messageId: string, emoji: string) =>
      request<ChatMessage>('POST', `${message(id, messageId)}/reactions`, {
        json: { emoji },
      }),
    markRead: (id: string) =>
      request<{ conversationId: string; lastReadAt: string }>(
        'POST',
        `${chat(id)}/read`,
      ),
    unseenTotal: async () =>
      (await request<{ total: number }>('GET', 'unseen')).total,
    /** A photo or document of up to 10 MB; photos go in `attachments`, documents in `files`. */
    uploadFile: (file: File) =>
      request<ChatUpload>(
        'POST',
        `attachments?name=${encodeURIComponent(file.name)}`,
        { file },
      ),
    /** GIPHY GIFs or stickers; an empty search shows what's trending. */
    searchGifs: (kind: 'gifs' | 'stickers', q: string, offset = 0) => {
      const params = new URLSearchParams({
        type: kind,
        offset: String(offset),
      });
      if (q.trim()) params.set('q', q.trim());
      return request<GifPage>('GET', `gifs?${params}`);
    },
  };
}

/** Same-origin by default, through the UI's /api rewrite; NEXT_PUBLIC_CHAT_WS_URL overrides it. */
export function chatSocketUrl(
  account: ChatRole,
  base = process.env.NEXT_PUBLIC_CHAT_WS_URL,
  location: Pick<Location, 'protocol' | 'host'> = window.location,
): string {
  const root = base
    ? base.replace(/\/+$/, '')
    : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/chat/ws`;
  return `${root}?as=${account}`;
}
