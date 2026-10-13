'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import {
  ArrowLeft,
  Bell,
  Loader2,
  MessagesSquare,
  WifiOff,
  X,
} from 'lucide-react';
import {
  CHAT_TYPING_SHOWS_MS,
  isOtherSide,
  isOwnMessage,
  mergeMessages,
  messagePreview,
  personKey,
  presenceLabel,
  type ChatMessage,
  type ChatReply,
  type ConversationSummary,
  type MessageContent,
  type MessagePage,
} from '@org/models/chat';
import { ChatRequestError } from './chat-api';
import { CHAT_POLL_MS, chatKeys } from './chat-queries';
import { useChat, type ChatEvent } from './chat-provider';
import { ConversationList } from './conversation-list';
import { MessageBubble } from './message-bubble';
import { MessageComposer, type ComposerDraft } from './message-composer';
import { ChatAvatar } from './presence-dot';

type Pages = InfiniteData<MessagePage, string | undefined>;

type PendingMessage = {
  clientId: string;
  conversationId: string;
  content: MessageContent;
  replyTo: ChatReply | null;
  error: string | null;
};

type Typist = { key: string; name: string; until: number };

export type ChatInboxProps = {
  /** Shown when there are no chats yet. */
  emptyHint?: string;
  /** Replaces the default height classes. */
  className?: string;
};

const NEAR_BOTTOM_PX = 80;
const NEAR_TOP_PX = 60;
/** How often the open chat checks for messages while the live connection is down. */
const OFFLINE_POLL_MS = 5_000;
const NOTIFICATIONS_DISMISSED_KEY = 'mlimalink:chat-notifications-dismissed';

const errorText = (error: unknown) =>
  error instanceof ChatRequestError
    ? error.message
    : 'Something went wrong. Please try again.';

/** The later of two ISO dates. */
const later = (a: string | null | undefined, b: string | null | undefined) =>
  !a ? (b ?? null) : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b;

const newClientId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function withoutUnseen(chats: ConversationSummary[], id: string) {
  return chats.some((chat) => chat.id === id && chat.unseenCount > 0)
    ? chats.map((chat) => (chat.id === id ? { ...chat, unseenCount: 0 } : chat))
    : chats;
}

/**
 * Chat list plus the open conversation, kept live by the surrounding ChatProvider. The
 * open chat is the `conversationId` search param, so links and the back button work.
 */
export function ChatInbox({
  emptyHint = 'No conversations yet.',
  className = 'h-[calc(100dvh-12rem)] min-h-[480px]',
}: ChatInboxProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const {
    account,
    viewerId,
    api,
    connected,
    send,
    subscribe,
    presence,
    setActiveConversation,
    refreshWatch,
    notificationPermission,
    requestNotifications,
  } = useChat();
  const me = useMemo(
    () => ({ role: account, id: viewerId }),
    [account, viewerId],
  );
  const myKey = personKey(me);

  const urlConversationId = searchParams.get('conversationId');
  const [chats, setChats] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(
    urlConversationId,
  );
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  const [syncedUrlId, setSyncedUrlId] = useState(urlConversationId);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [notificationsDismissed, setNotificationsDismissed] = useState(true);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  /** How far the other side has read each chat, from live receipts. */
  const [seenAt, setSeenAt] = useState<Record<string, string>>({});
  const [typists, setTypists] = useState<Record<string, Typist>>({});
  const [contextFor, setContextFor] = useState(conversationId);

  const messageContainerRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const heightBeforeOlderRef = useRef<number | null>(null);
  const handleEventRef = useRef<(event: ChatEvent) => void>(() => undefined);
  /** How many of your reactions are on their way, by message id. */
  const reacting = useRef(new Map<string, number>());
  const latestRef = useRef({ conversationId, chats });

  // Back/forward and links change the URL; follow them.
  if (urlConversationId !== syncedUrlId) {
    setSyncedUrlId(urlConversationId);
    setConversationId(urlConversationId);
  }
  // A reply or edit belongs to the chat it was started in.
  if (contextFor !== conversationId) {
    setContextFor(conversationId);
    setReplyTo(null);
    setEditing(null);
  }

  const conversationsQuery = useQuery({
    queryKey: chatKeys.conversations(account),
    queryFn: api.listConversations,
    refetchInterval: CHAT_POLL_MS,
    retry: 1,
  });
  const [syncedChats, setSyncedChats] = useState<ConversationSummary[]>();
  if (conversationsQuery.data !== syncedChats) {
    setSyncedChats(conversationsQuery.data);
    if (conversationsQuery.data) setChats(conversationsQuery.data);
  }
  if (!hasFetchedOnce && conversationsQuery.isFetched) setHasFetchedOnce(true);

  const listed = chats.find((chat) => chat.id === conversationId) ?? null;
  // A chat opened from a link may not be in the list yet; this also checks access.
  const singleQuery = useQuery({
    queryKey: chatKeys.conversation(account, conversationId ?? ''),
    queryFn: () => api.getConversation(conversationId as string),
    enabled: Boolean(conversationId) && hasFetchedOnce && !listed,
    retry: false,
  });
  const active = listed ?? singleQuery.data ?? null;

  const {
    data: pages,
    isLoading,
    error: messagesError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    dataUpdatedAt,
  } = useInfiniteQuery({
    queryKey: chatKeys.messages(account, conversationId ?? ''),
    queryFn: ({ pageParam }) =>
      api.listMessages(conversationId as string, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore && last.nextCursor) || undefined,
    enabled: Boolean(conversationId),
    refetchOnWindowFocus: false,
    refetchInterval: connected ? false : OFFLINE_POLL_MS,
    retry: false,
  });
  const messages = useMemo(
    () =>
      mergeMessages([], pages?.pages.flatMap((page) => page.messages) ?? []),
    [pages],
  );
  const pendingHere = pending.filter(
    (item) => item.conversationId === conversationId,
  );

  useEffect(() => {
    latestRef.current = { conversationId, chats };
  });

  const clearUnseen = useCallback(
    (id: string) => {
      setChats((current) => withoutUnseen(current, id));
      void queryClient.invalidateQueries({
        queryKey: chatKeys.unseen(account),
      });
    },
    [account, queryClient],
  );

  // Loading the newest page marks the chat as read on the server.
  useEffect(() => {
    if (conversationId && dataUpdatedAt) clearUnseen(conversationId);
  }, [conversationId, dataUpdatedAt, clearUnseen]);

  const addToThread = useCallback(
    (message: ChatMessage) => {
      queryClient.setQueryData<Pages>(
        chatKeys.messages(account, message.conversationId),
        (data) => {
          if (!data?.pages.length) return data;
          if (
            data.pages.some((page) =>
              page.messages.some(({ id }) => id === message.id),
            )
          ) {
            return data;
          }
          const [newest, ...older] = data.pages;
          return {
            ...data,
            pages: [
              { ...newest, messages: [message, ...newest.messages] },
              ...older,
            ],
          };
        },
      );
    },
    [account, queryClient],
  );

  /** Puts an edited, deleted or reacted-to message in place of the old one. */
  const replaceInThread = useCallback(
    (message: ChatMessage) => {
      queryClient.setQueryData<Pages>(
        chatKeys.messages(account, message.conversationId),
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((page) =>
              page.messages.some(({ id }) => id === message.id)
                ? {
                    ...page,
                    messages: page.messages.map((current) =>
                      current.id === message.id ? message : current,
                    ),
                  }
                : page,
            ),
          },
      );
      setChats((current) =>
        current.map((chat) =>
          chat.id === message.conversationId &&
          chat.lastMessageAt === message.createdAt
            ? { ...chat, lastMessage: messagePreview(message) }
            : chat,
        ),
      );
      if (message.deletedAt) {
        setEditing((current) => (current?.id === message.id ? null : current));
        setReplyTo((current) => (current?.id === message.id ? null : current));
      }
    },
    [account, queryClient],
  );

  const sendRead = useCallback(
    (id: string) => {
      if (send({ type: 'read', conversationId: id })) return;
      api.markRead(id).then(
        () => clearUnseen(id),
        () => undefined,
      );
    },
    [api, send, clearUnseen],
  );

  useEffect(() => {
    handleEventRef.current = (event) => {
      if (event.type === 'disconnected') {
        setPending((current) =>
          current.map((item) =>
            item.error
              ? item
              : {
                  ...item,
                  error: 'The connection dropped; this may not have sent.',
                },
          ),
        );
        return;
      }
      if (event.type === 'error') {
        if (event.clientId) {
          setPending((current) =>
            current.map((item) =>
              item.clientId === event.clientId
                ? { ...item, error: event.message }
                : item,
            ),
          );
        } else {
          setSendError(event.message);
        }
        return;
      }
      if (event.type === 'read') {
        clearUnseen(event.conversationId);
        return;
      }
      if (event.type === 'updated') {
        replaceInThread(keepPendingReaction(event.message));
        return;
      }
      if (event.type === 'seen') {
        if (!isOtherSide(me, event.reader)) return;
        setSeenAt((current) => {
          const next = later(current[event.conversationId], event.lastReadAt);
          return next === current[event.conversationId]
            ? current
            : { ...current, [event.conversationId]: next as string };
        });
        return;
      }
      if (event.type === 'typing') {
        if (event.from.key === myKey) return;
        setTypists((current) => ({
          ...current,
          [event.conversationId]: {
            ...event.from,
            until: Date.now() + CHAT_TYPING_SHOWS_MS,
          },
        }));
        return;
      }
      if (event.type !== 'message' && event.type !== 'sent') return;

      const { message } = event;
      if (event.type === 'sent') {
        setPending((current) =>
          current.filter((item) => item.clientId !== event.clientId),
        );
      }
      addToThread(message);

      const own = isOwnMessage(message, me);
      // Their message arrived, so they've stopped typing it.
      const senderKey = personKey({
        role: message.senderRole,
        id: message.senderId,
      });
      setTypists((current) => {
        if (current[message.conversationId]?.key !== senderKey) return current;
        const next = { ...current };
        delete next[message.conversationId];
        return next;
      });
      const open =
        message.conversationId === conversationId &&
        document.visibilityState === 'visible';
      if (!own && open) sendRead(message.conversationId);

      if (!chats.some((chat) => chat.id === message.conversationId)) {
        void queryClient.invalidateQueries({
          queryKey: chatKeys.conversations(account),
        });
        return;
      }
      setChats((current) => {
        const chat = current.find(({ id }) => id === message.conversationId);
        if (!chat) return current;
        const updated: ConversationSummary = {
          ...chat,
          lastMessage: messagePreview(message),
          lastMessageAt: message.createdAt,
          unseenCount:
            own || open
              ? chat.unseenCount
              : Math.min(chat.unseenCount + 1, 100),
        };
        return [updated, ...current.filter(({ id }) => id !== chat.id)];
      });
    };
  });

  useEffect(
    () => subscribe((event) => handleEventRef.current(event)),
    [subscribe],
  );

  useEffect(() => {
    setActiveConversation(conversationId);
    return () => setActiveConversation(null);
  }, [conversationId, setActiveConversation]);

  // Someone new to chat with: start receiving their status.
  const chatIds = chats.map(({ id }) => id).join(',');
  const watchedIdsRef = useRef(chatIds);
  useEffect(() => {
    if (watchedIdsRef.current === chatIds) return;
    watchedIdsRef.current = chatIds;
    refreshWatch();
  }, [chatIds, refreshWatch]);

  useEffect(() => {
    try {
      setNotificationsDismissed(
        localStorage.getItem(NOTIFICATIONS_DISMISSED_KEY) === '1',
      );
    } catch {
      setNotificationsDismissed(false);
    }
  }, []);

  function dismissNotifications() {
    setNotificationsDismissed(true);
    try {
      localStorage.setItem(NOTIFICATIONS_DISMISSED_KEY, '1');
    } catch {
      // Private browsing can refuse storage; the banner just comes back next visit.
    }
  }

  // Coming back to the tab reads whatever arrived in the open chat meanwhile.
  useEffect(() => {
    const onVisible = () => {
      const { conversationId: id, chats: current } = latestRef.current;
      if (
        document.visibilityState === 'visible' &&
        id &&
        current.some((chat) => chat.id === id && chat.unseenCount > 0)
      ) {
        sendRead(id);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [sendRead]);

  // "typing…" fades a few seconds after the last sign of it.
  useEffect(() => {
    const untils = Object.values(typists).map(({ until }) => until);
    if (untils.length === 0) return;
    const timer = setTimeout(
      () =>
        setTypists((current) =>
          Object.fromEntries(
            Object.entries(current).filter(
              ([, { until }]) => until > Date.now(),
            ),
          ),
        ),
      Math.max(Math.min(...untils) - Date.now(), 0) + 50,
    );
    return () => clearTimeout(timer);
  }, [typists]);

  const deliver = useCallback(
    async (id: string, content: MessageContent, reply: ChatReply | null) => {
      const clientId = newClientId();
      setPending((current) => [
        ...current,
        { clientId, conversationId: id, content, replyTo: reply, error: null },
      ]);
      if (send({ type: 'send', conversationId: id, clientId, ...content })) {
        return;
      }
      setPending((current) =>
        current.filter((item) => item.clientId !== clientId),
      );
      const message = await api.sendMessage(id, content);
      handleEventRef.current({ type: 'sent', message });
    },
    [api, send],
  );

  async function handleSend({ body, files, gif }: ComposerDraft) {
    if (!conversationId) return false;
    setSendError(null);
    stickToBottomRef.current = true;
    try {
      const uploads = await Promise.all(files.map(api.uploadFile));
      const content: MessageContent = { body };
      const photos = uploads.filter((upload) => upload.kind === 'photo');
      const documents = uploads.filter((upload) => upload.kind === 'document');
      if (photos.length) content.attachments = photos.map(({ url }) => url);
      if (documents.length) {
        content.files = documents.map(({ url, name, size, mimeType }) => ({
          url,
          name,
          size,
          mimeType,
        }));
      }
      if (gif) content.gif = gif;
      const reply = replyTo
        ? {
            id: replyTo.id,
            senderName: replyTo.senderName,
            preview: messagePreview(replyTo),
          }
        : null;
      if (reply) content.replyToId = reply.id;
      await deliver(conversationId, content, reply);
      setReplyTo(null);
      return true;
    } catch (error) {
      setSendError(errorText(error));
      return false;
    }
  }

  function retry(item: PendingMessage) {
    setPending((current) =>
      current.filter(({ clientId }) => clientId !== item.clientId),
    );
    deliver(item.conversationId, item.content, item.replyTo).catch((error) =>
      setSendError(errorText(error)),
    );
  }

  /** Runs an edit, delete or reaction and shows the result straight away. */
  function change(request: Promise<ChatMessage>) {
    setSendError(null);
    return request.then(
      (message) => {
        replaceInThread(message);
        return true;
      },
      (error: unknown) => {
        setSendError(errorText(error));
        return false;
      },
    );
  }

  /** Your own reaction while it's on its way, so a live update doesn't undo it. */
  function keepPendingReaction(message: ChatMessage): ChatMessage {
    if (!reacting.current.has(message.id)) return message;
    const shown = queryClient
      .getQueryData<Pages>(chatKeys.messages(account, message.conversationId))
      ?.pages.flatMap((page) => page.messages)
      .find(({ id }) => id === message.id);
    if (!shown) return message;
    const mine = shown.reactions.filter(({ key }) => key === myKey);
    return {
      ...message,
      reactions: [
        ...message.reactions.filter(({ key }) => key !== myKey),
        ...mine,
      ],
    };
  }

  /**
   * Shows the reaction straight away, the way the server will store it: the same emoji
   * again takes it away. The server's answer then replaces it, once no other reaction to
   * that message is on its way; a refusal reloads the chat.
   */
  function react(message: ChatMessage, emoji: string) {
    const mine = message.reactions.find(({ key }) => key === myKey);
    const others = message.reactions.filter(({ key }) => key !== myKey);
    replaceInThread({
      ...message,
      reactions:
        mine?.emoji === emoji
          ? others
          : [...others, { emoji, key: myKey, name: mine?.name ?? 'You' }],
    });
    const inFlight = reacting.current;
    inFlight.set(message.id, (inFlight.get(message.id) ?? 0) + 1);
    const settle = () => {
      const left = (inFlight.get(message.id) ?? 1) - 1;
      if (left > 0) inFlight.set(message.id, left);
      else inFlight.delete(message.id);
      return left <= 0;
    };
    setSendError(null);
    api.react(message.conversationId, message.id, emoji).then(
      (saved) => {
        if (settle()) replaceInThread(saved);
      },
      (error: unknown) => {
        setSendError(errorText(error));
        if (settle()) {
          void queryClient.invalidateQueries({
            queryKey: chatKeys.messages(account, message.conversationId),
          });
        }
      },
    );
  }

  async function saveEdit(body: string) {
    if (!editing) return false;
    const saved = await change(
      api.editMessage(editing.conversationId, editing.id, body),
    );
    if (saved) setEditing(null);
    return saved;
  }

  function jumpToMessage(id: string) {
    document
      .getElementById(`message-${id}`)
      ?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }

  function selectConversation(id: string | null) {
    stickToBottomRef.current = true;
    setSendError(null);
    setConversationId(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set('conversationId', id);
    else params.delete('conversationId');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  function loadOlder() {
    if (!hasNextPage || isFetchingNextPage) return;
    heightBeforeOlderRef.current =
      messageContainerRef.current?.scrollHeight ?? null;
    void fetchNextPage().then((result) => {
      if (result.isError) heightBeforeOlderRef.current = null;
    });
  }

  function handleScroll() {
    const container = messageContainerRef.current;
    if (!container) return;
    stickToBottomRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      NEAR_BOTTOM_PX;
    if (container.scrollTop < NEAR_TOP_PX) loadOlder();
  }

  // Older messages go on top; keep what the reader was looking at in place.
  const firstMessageId = messages[0]?.id;
  useLayoutEffect(() => {
    const container = messageContainerRef.current;
    if (container && heightBeforeOlderRef.current !== null) {
      container.scrollTop +=
        container.scrollHeight - heightBeforeOlderRef.current;
      heightBeforeOlderRef.current = null;
    }
  }, [firstMessageId]);

  // New messages go at the bottom; follow them unless the reader scrolled up.
  const lastMessageId = messages.at(-1)?.id;
  useEffect(() => {
    if (stickToBottomRef.current) {
      scrollAnchorRef.current?.scrollIntoView?.({ block: 'end' });
    }
  }, [lastMessageId, pendingHere.length, conversationId]);

  const livePresence = useCallback(
    (chat: ConversationSummary): ConversationSummary => {
      const live =
        chat.counterpart && presence.get(personKey(chat.counterpart));
      return live ? { ...chat, presence: live } : chat;
    },
    [presence],
  );
  const shownChats = useMemo(
    () => chats.map(livePresence),
    [chats, livePresence],
  );
  const shownActive = active && livePresence(active);

  const threadError = messagesError ?? singleQuery.error;
  const showSenderNames =
    shownActive?.kind === 'support' && account !== 'admin';
  const typist = conversationId ? typists[conversationId] : undefined;
  const status = typist
    ? `${typist.name} is typing…`
    : shownActive?.presence
      ? presenceLabel(shownActive.presence)
      : (shownActive?.subtitle ?? '');
  const readUpTo = conversationId
    ? later(seenAt[conversationId], pages?.pages[0]?.seenAt)
    : null;
  const askForNotifications =
    notificationPermission === 'default' && !notificationsDismissed;

  return (
    <div
      className={`grid overflow-hidden rounded-xl border border-neutral-200 bg-white md:grid-cols-[320px_1fr] ${className}`}
    >
      <aside
        className={`${conversationId ? 'hidden md:flex' : 'flex'} min-h-0 flex-col border-neutral-200 md:border-r`}
      >
        {askForNotifications && (
          <div className="flex items-start gap-2 border-b border-neutral-200 bg-brand-start/5 px-3 py-2 text-xs text-neutral-700">
            <Bell size={14} className="mt-0.5 shrink-0 text-brand-start" />
            <p className="flex-1">
              Get notified of new messages while you’re in another tab.{' '}
              <button
                type="button"
                onClick={() => void requestNotifications()}
                className="font-semibold text-brand-start hover:underline"
              >
                Turn on
              </button>
            </p>
            <button
              type="button"
              onClick={dismissNotifications}
              aria-label="Not now"
              className="rounded p-0.5 text-neutral-500 hover:bg-neutral-200"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <ConversationList
          chats={shownChats}
          activeId={conversationId}
          onSelect={selectConversation}
          search={search}
          onSearch={setSearch}
          hasFetchedOnce={hasFetchedOnce}
          error={
            conversationsQuery.error
              ? errorText(conversationsQuery.error)
              : null
          }
          emptyHint={emptyHint}
        />
      </aside>

      <section
        className={`${conversationId ? 'flex' : 'hidden md:flex'} min-h-0 flex-col`}
        aria-label="Conversation"
      >
        {!conversationId ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-start/10 text-brand-start">
              <MessagesSquare size={26} />
            </span>
            <h2 className="font-poppins text-lg font-semibold text-neutral-900">
              Select a conversation
            </h2>
            <p className="mt-1.5 max-w-sm text-sm text-neutral-500">
              Pick a chat on the left to read and reply.
            </p>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3">
              <button
                type="button"
                onClick={() => selectConversation(null)}
                aria-label="Back to conversations"
                className="rounded-lg p-1.5 text-neutral-600 hover:bg-neutral-100 md:hidden"
              >
                <ArrowLeft size={20} />
              </button>
              {shownActive ? (
                <>
                  <ChatAvatar
                    name={shownActive.title}
                    presence={shownActive.presence}
                    size="lg"
                  />
                  <div className="min-w-0">
                    <h2 className="truncate font-poppins font-semibold text-neutral-900">
                      {shownActive.title}
                    </h2>
                    {status && (
                      <p
                        aria-live={typist ? 'polite' : undefined}
                        className={`truncate text-xs ${typist ? 'text-brand-start italic' : 'text-neutral-500'}`}
                      >
                        {status}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <span className="h-5 w-40 animate-pulse rounded bg-neutral-200" />
              )}
            </header>

            {!connected && hasFetchedOnce && (
              <p
                role="status"
                className="flex items-center gap-2 bg-amber-50 px-4 py-1.5 text-xs text-amber-800"
              >
                <WifiOff size={14} />
                Reconnecting… new messages will appear when you’re back online.
              </p>
            )}

            <div
              ref={messageContainerRef}
              onScroll={handleScroll}
              className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
            >
              {threadError ? (
                <p
                  role="alert"
                  className="mx-auto max-w-sm py-12 text-center text-sm text-rose-600"
                >
                  {errorText(threadError)}
                </p>
              ) : isLoading ? (
                <div className="flex justify-center py-12 text-neutral-500">
                  <Loader2
                    className="animate-spin"
                    aria-label="Loading messages"
                  />
                </div>
              ) : (
                <>
                  {hasNextPage && (
                    <div className="mb-3 flex justify-center">
                      <button
                        type="button"
                        onClick={loadOlder}
                        disabled={isFetchingNextPage}
                        className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-60"
                      >
                        {isFetchingNextPage
                          ? 'Loading…'
                          : 'Load earlier messages'}
                      </button>
                    </div>
                  )}
                  {messages.length === 0 && pendingHere.length === 0 ? (
                    <p className="py-12 text-center text-sm text-neutral-500">
                      No messages yet. Say hello!
                    </p>
                  ) : (
                    <ol aria-label="Messages" className="space-y-2">
                      {messages.map((message, index) => {
                        const own = isOwnMessage(message, me);
                        const previous = messages[index - 1];
                        const named =
                          showSenderNames &&
                          !own &&
                          (previous?.senderId !== message.senderId ||
                            previous?.senderRole !== message.senderRole);
                        return (
                          <MessageBubble
                            key={message.id}
                            id={message.id}
                            body={message.body}
                            attachments={message.attachments}
                            files={message.files}
                            gif={message.gif}
                            replyTo={message.replyTo}
                            reactions={message.reactions}
                            editedAt={message.editedAt}
                            deletedAt={message.deletedAt}
                            own={own}
                            senderName={named ? message.senderName : undefined}
                            createdAt={message.createdAt}
                            seen={
                              own
                                ? Boolean(readUpTo) &&
                                  Date.parse(message.createdAt) <=
                                    Date.parse(readUpTo as string)
                                : undefined
                            }
                            viewerKey={myKey}
                            onQuoteClick={jumpToMessage}
                            actions={{
                              onReact: (emoji) => react(message, emoji),
                              onReply: () => {
                                setEditing(null);
                                setReplyTo(message);
                              },
                              onEdit:
                                own && !message.gif
                                  ? () => {
                                      setReplyTo(null);
                                      setEditing(message);
                                    }
                                  : undefined,
                              onDelete: own
                                ? () =>
                                    void change(
                                      api.deleteMessage(
                                        message.conversationId,
                                        message.id,
                                      ),
                                    )
                                : undefined,
                            }}
                          />
                        );
                      })}
                      {pendingHere.map((item) => (
                        <MessageBubble
                          key={item.clientId}
                          body={item.content.body}
                          attachments={item.content.attachments ?? []}
                          files={item.content.files}
                          gif={item.content.gif}
                          replyTo={item.replyTo}
                          own
                          status={
                            item.error
                              ? {
                                  error: item.error,
                                  onRetry: () => retry(item),
                                }
                              : 'sending'
                          }
                        />
                      ))}
                    </ol>
                  )}
                </>
              )}
              <div ref={scrollAnchorRef} />
            </div>

            {sendError && (
              <p
                role="alert"
                className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700"
              >
                {sendError}
              </p>
            )}
            <MessageComposer
              onSend={handleSend}
              onTyping={() => {
                if (conversationId) send({ type: 'typing', conversationId });
              }}
              searchGifs={api.searchGifs}
              replyingTo={
                replyTo && {
                  senderName: replyTo.senderName,
                  preview: messagePreview(replyTo),
                }
              }
              onCancelReply={() => setReplyTo(null)}
              editing={
                editing && {
                  id: editing.id,
                  body: editing.body,
                  canBeEmpty:
                    editing.attachments.length > 0 || editing.files.length > 0,
                }
              }
              onSaveEdit={saveEdit}
              onCancelEdit={() => setEditing(null)}
              disabled={Boolean(threadError)}
            />
          </>
        )}
      </section>
    </div>
  );
}
