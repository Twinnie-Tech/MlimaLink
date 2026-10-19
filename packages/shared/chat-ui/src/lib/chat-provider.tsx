'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { MessageCircle, X } from 'lucide-react';
import {
  CHAT_SESSION_EXPIRED_CODE,
  formatUnseen,
  isOwnMessage,
  messagePreview,
  parseChatServerEvent,
  type ActivePresenceStatus,
  type ChatClientEvent,
  type ChatMessage,
  type ChatRole,
  type ChatServerEvent,
  type ManualPresenceStatus,
  type Presence,
  type PresenceStatus,
} from '@org/models/chat';
import {
  chatSocketNeedsTicket,
  chatSocketUrl,
  createChatApi,
  type ChatApi,
} from './chat-api';
import { chatKeys, useUnseenTotal } from './chat-queries';
import { useIdleStatus } from './use-idle-status';

export type ChatEvent = ChatServerEvent | { type: 'disconnected' };
export type ChatListener = (event: ChatEvent) => void;
type NotificationState = NotificationPermission | 'unsupported';

export type ChatContextValue = {
  account: ChatRole;
  viewerId: string;
  api: ChatApi;
  /** True while the live connection is open. */
  connected: boolean;
  /** Sends over the live connection; false when it isn't open. */
  send: (event: ChatClientEvent) => boolean;
  subscribe: (listener: ChatListener) => () => void;
  /** Statuses pushed by the server, by person key; newer than any list. */
  presence: ReadonlyMap<string, Presence>;
  /** The chat on screen, so its messages don't raise notifications. */
  setActiveConversation: (id: string | null) => void;
  /** Asks for statuses again, e.g. after a new chat appears. */
  refreshWatch: () => void;
  notificationPermission: NotificationState;
  requestNotifications: () => Promise<void>;
  /** Your own status as others see it. */
  myStatus: PresenceStatus;
  /** Admins: the status they set by hand; null when automatic. */
  manualStatus: ManualPresenceStatus | null;
  /** Admins only; null goes back to automatic. False when not connected. */
  setManualStatus: (status: ManualPresenceStatus | null) => boolean;
};

type Toast = {
  id: string;
  conversationId: string;
  title: string;
  body: string;
};

const ChatContext = createContext<ChatContextValue | null>(null);

const RECONNECT_MAX_MS = 15_000;
const TOAST_MS = 6_000;
const MAX_TOASTS = 3;
const COUNT_PREFIX = /^\(\d+\+?\) /;

const notificationState = (): NotificationState =>
  typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;

/** A short two-note chime; silently skipped where audio isn't allowed yet. */
function chime() {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const context = new AudioCtx();
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
    [880, 1320].forEach((frequency, index) => {
      const tone = context.createOscillator();
      tone.frequency.value = frequency;
      tone.connect(gain);
      tone.start(context.currentTime + index * 0.12);
      tone.stop(context.currentTime + 0.35);
    });
    setTimeout(() => void context.close(), 600);
  } catch {
    // No audio: notifications still show.
  }
}

/** The live chat connection for everything inside, or throws outside a ChatProvider. */
export function useChat(): ChatContextValue {
  const value = useContext(ChatContext);
  if (!value) throw new Error('useChat must be used inside a <ChatProvider>.');
  return value;
}

export type ChatProviderProps = {
  account: ChatRole;
  /** The signed-in person; nothing connects while this is null. */
  viewerId: string | null;
  refreshSession: () => Promise<unknown>;
  /** Where the inbox lives, for "Open" links in notifications. */
  inboxPath: string;
  children: ReactNode;
};

/**
 * Keeps one chat connection per tab on every page: badges and statuses update as soon
 * as the server says so, new messages raise a toast (or a browser notification when the
 * tab is hidden) unless an admin set do not disturb, and the person shows as away after
 * a few idle minutes.
 */
export function ChatProvider({
  account,
  viewerId,
  refreshSession,
  inboxPath,
  children,
}: ChatProviderProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const api = useMemo(
    () => createChatApi({ account, refreshSession }),
    [account, refreshSession],
  );
  const [connected, setConnected] = useState(false);
  const [presence, setPresence] = useState<ReadonlyMap<string, Presence>>(
    () => new Map(),
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [idleStatus, setIdleStatus] =
    useState<ActivePresenceStatus>('available');
  const [manualStatus, setManualStatusState] =
    useState<ManualPresenceStatus | null>(null);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationState>('unsupported');
  const unseen = useUnseenTotal({
    account,
    refreshSession,
    enabled: Boolean(viewerId),
  });

  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef(new Set<ChatListener>());
  const activeConversationRef = useRef<string | null>(null);
  const handleRef = useRef<(event: ChatServerEvent) => void>(() => undefined);

  useEffect(() => {
    setNotificationPermission(notificationState());
  }, []);

  const send = useCallback((event: ChatClientEvent) => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(event));
    return true;
  }, []);

  const subscribe = useCallback((listener: ChatListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const setActiveConversation = useCallback((id: string | null) => {
    activeConversationRef.current = id;
  }, []);

  const refreshWatch = useCallback(() => {
    send({ type: 'watch' });
  }, [send]);

  const setManualStatus = useCallback(
    (status: ManualPresenceStatus | null) => {
      if (!send({ type: 'status', status })) return false;
      setManualStatusState(status);
      return true;
    },
    [send],
  );

  const requestNotifications = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    setNotificationPermission(await Notification.requestPermission());
  }, []);

  const openChat = useCallback(
    (conversationId: string) =>
      router.push(`${inboxPath}?conversationId=${conversationId}`),
    [router, inboxPath],
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message: ChatMessage) => {
      const title = message.senderName;
      const body = messagePreview(message);
      chime();
      if (document.visibilityState === 'hidden') {
        if (notificationState() !== 'granted') return;
        const notification = new Notification(title, {
          body,
          tag: message.conversationId,
        });
        notification.onclick = () => {
          window.focus();
          openChat(message.conversationId);
          notification.close();
        };
        return;
      }
      setToasts((current) =>
        [
          ...current.filter(
            (toast) => toast.conversationId !== message.conversationId,
          ),
          {
            id: message.id,
            conversationId: message.conversationId,
            title,
            body,
          },
        ].slice(-MAX_TOASTS),
      );
      setTimeout(() => dismissToast(message.id), TOAST_MS);
    },
    [dismissToast, openChat],
  );

  useEffect(() => {
    handleRef.current = (event) => {
      if (event.type === 'presence') {
        setPresence((current) => {
          const next = new Map(current);
          for (const { key, status, lastSeenAt } of event.updates) {
            next.set(key, { status, lastSeenAt });
          }
          return next;
        });
        return;
      }
      if (event.type === 'status') {
        setManualStatusState(event.manual);
        return;
      }
      if (event.type === 'read') {
        void queryClient.invalidateQueries({
          queryKey: chatKeys.unseen(account),
        });
        return;
      }
      if (event.type === 'updated') {
        void queryClient.invalidateQueries({
          queryKey: chatKeys.conversations(account),
          refetchType: 'none',
        });
        return;
      }
      if (event.type !== 'message' || !viewerId) return;

      const { message } = event;
      // Pages that aren't showing chat refetch when they next are.
      void queryClient.invalidateQueries({
        queryKey: chatKeys.messages(account, message.conversationId),
        refetchType: 'none',
      });
      void queryClient.invalidateQueries({
        queryKey: chatKeys.conversations(account),
        refetchType: 'none',
      });
      if (isOwnMessage(message, { role: account, id: viewerId })) return;
      const onScreen =
        activeConversationRef.current === message.conversationId &&
        document.visibilityState === 'visible';
      if (onScreen) return;
      void queryClient.invalidateQueries({
        queryKey: chatKeys.unseen(account),
      });
      // Do not disturb: badges still count, but nothing pops up or chimes.
      if (manualStatus !== 'dnd') notify(message);
    };
  });

  const sendPresence = useCallback(
    (status: ActivePresenceStatus) => {
      setIdleStatus(status);
      send({ type: 'presence', status });
    },
    [send],
  );
  const idleStatusRef = useIdleStatus(sendPresence);

  useEffect(() => {
    if (!viewerId) return;
    let closed = false;
    let attempt = 0;
    let everConnected = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const reconnect = (delay: number, refresh: boolean) => {
      timer = setTimeout(() => {
        if (!refresh) {
          connect();
          return;
        }
        refreshSession()
          .catch(() => undefined)
          .finally(() => {
            if (!closed) connect();
          });
      }, delay);
    };

    function connect() {
      if (!chatSocketNeedsTicket()) {
        open(chatSocketUrl(account));
        return;
      }
      api.socketTicket().then(
        ({ ticket }) => {
          if (!closed) {
            open(chatSocketUrl(account, undefined, undefined, ticket));
          }
        },
        () => {
          // Fetching a ticket already renewed the session if that was the problem.
          if (closed) return;
          const delay = Math.min(1000 * 2 ** attempt, RECONNECT_MAX_MS);
          attempt += 1;
          reconnect(delay, false);
        },
      );
    }

    function open(url: string) {
      const ws = new WebSocket(url);
      let opened = false;
      wsRef.current = ws;

      ws.onopen = () => {
        opened = true;
        attempt = 0;
        setConnected(true);
        if (idleStatusRef.current === 'away') {
          ws.send(JSON.stringify({ type: 'presence', status: 'away' }));
        }
        ws.send(JSON.stringify({ type: 'watch' }));
        // Catch up on anything sent while the connection was down.
        if (everConnected) {
          void queryClient.invalidateQueries({
            queryKey: chatKeys.all(account),
          });
        }
        everConnected = true;
      };
      ws.onmessage = (event) => {
        const parsed = parseChatServerEvent(event.data);
        if (!parsed) return;
        handleRef.current(parsed);
        listenersRef.current.forEach((listener) => listener(parsed));
      };
      ws.onclose = (event) => {
        // A socket this effect already replaced or shut down has nothing to report.
        if (closed) return;
        if (wsRef.current === ws) wsRef.current = null;
        setConnected(false);
        listenersRef.current.forEach((listener) =>
          listener({ type: 'disconnected' }),
        );
        if (event.code === CHAT_SESSION_EXPIRED_CODE) {
          reconnect(0, true);
          return;
        }
        const delay = Math.min(1000 * 2 ** attempt, RECONNECT_MAX_MS);
        attempt += 1;
        // A refused upgrade is usually an expired access token.
        reconnect(delay, !opened);
      };
    }

    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [account, api, viewerId, refreshSession, queryClient, idleStatusRef]);

  // "(3) MlimaLink" in the tab title; Next.js rewrites the title on navigation, so it's
  // put back whenever the head changes.
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(COUNT_PREFIX, '');
      const title = unseen > 0 ? `(${formatUnseen(unseen)}) ${base}` : base;
      if (document.title !== title) document.title = title;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    return () => {
      observer.disconnect();
      document.title = document.title.replace(COUNT_PREFIX, '');
    };
  }, [unseen]);

  const myStatus: PresenceStatus = connected
    ? (manualStatus ?? idleStatus)
    : 'offline';

  const value = useMemo<ChatContextValue | null>(
    () =>
      viewerId
        ? {
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
            myStatus,
            manualStatus,
            setManualStatus,
          }
        : null,
    [
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
      myStatus,
      manualStatus,
      setManualStatus,
    ],
  );

  return (
    <ChatContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <ol
          aria-label="New messages"
          className="fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
        >
          {toasts.map((toast) => (
            <li
              key={toast.id}
              role="status"
              className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg"
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-start/15 text-brand-start">
                <MessageCircle size={16} aria-hidden />
              </span>
              <button
                type="button"
                onClick={() => {
                  dismissToast(toast.id);
                  openChat(toast.conversationId);
                }}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-sm font-semibold text-neutral-900">
                  {toast.title}
                </span>
                <span className="line-clamp-2 text-xs text-neutral-600">
                  {toast.body}
                </span>
              </button>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss"
                className="rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ol>
      )}
    </ChatContext.Provider>
  );
}
