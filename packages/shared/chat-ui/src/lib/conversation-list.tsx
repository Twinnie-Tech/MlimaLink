import { MessagesSquare, Search } from 'lucide-react';
import {
  chatTimeLabel,
  formatUnseen,
  type ConversationSummary,
} from '@org/models/chat';
import { ChatAvatar } from './presence-dot';

export type ConversationListProps = {
  chats: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (value: string) => void;
  /** False until the first load finishes, so an empty list isn't shown too early. */
  hasFetchedOnce: boolean;
  error: string | null;
  emptyHint: string;
};

export function ConversationList({
  chats,
  activeId,
  onSelect,
  search,
  onSearch,
  hasFetchedOnce,
  error,
  emptyHint,
}: ConversationListProps) {
  const query = search.trim().toLowerCase();
  const visible = query
    ? chats.filter((chat) =>
        [chat.title, chat.subtitle, chat.lastMessage].some((text) =>
          text?.toLowerCase().includes(query),
        ),
      )
    : chats;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-neutral-200 p-3">
        <label className="relative block">
          <span className="sr-only">Search conversations</span>
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search conversations"
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2 pr-3 pl-9 text-sm text-neutral-900 outline-none placeholder:text-neutral-500 focus:border-brand-start"
          />
        </label>
      </div>

      {error && (
        <p
          role="alert"
          className="m-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {error}
        </p>
      )}

      {!hasFetchedOnce ? (
        <ul aria-label="Loading conversations" className="space-y-1 p-2">
          {[0, 1, 2, 3].map((row) => (
            <li key={row} className="flex items-center gap-3 rounded-lg p-2">
              <span className="h-10 w-10 animate-pulse rounded-full bg-neutral-200" />
              <span className="flex-1 space-y-2">
                <span className="block h-3 w-2/3 animate-pulse rounded bg-neutral-200" />
                <span className="block h-3 w-1/2 animate-pulse rounded bg-neutral-200" />
              </span>
            </li>
          ))}
        </ul>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-12 text-center">
          <MessagesSquare size={28} className="text-neutral-400" />
          <p className="mt-3 text-sm text-neutral-500">
            {query ? 'No conversations match your search.' : emptyHint}
          </p>
        </div>
      ) : (
        <ul
          aria-label="Conversations"
          className="min-h-0 flex-1 overflow-y-auto p-2"
        >
          {visible.map((chat) => {
            const unseen = formatUnseen(chat.unseenCount);
            const active = chat.id === activeId;
            return (
              <li key={chat.id}>
                <button
                  type="button"
                  onClick={() => onSelect(chat.id)}
                  aria-current={active || undefined}
                  className={`flex w-full items-center gap-3 rounded-lg p-2 text-left transition ${
                    active ? 'bg-brand-start/10' : 'hover:bg-neutral-100'
                  }`}
                >
                  <ChatAvatar name={chat.title} presence={chat.presence} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span
                        className={`truncate text-sm text-neutral-900 ${unseen ? 'font-semibold' : 'font-medium'}`}
                      >
                        {chat.title}
                      </span>
                      {chat.lastMessageAt && (
                        <span className="shrink-0 text-xs text-neutral-500">
                          {chatTimeLabel(chat.lastMessageAt)}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span
                        className={`truncate text-xs ${unseen ? 'font-medium text-neutral-800' : 'text-neutral-500'}`}
                      >
                        {chat.lastMessage ?? chat.subtitle ?? 'No messages yet'}
                      </span>
                      {unseen && (
                        <span
                          aria-label={`${unseen} unread`}
                          className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-start px-1.5 text-[11px] font-semibold text-white"
                        >
                          {unseen}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
