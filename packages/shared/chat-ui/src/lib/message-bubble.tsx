import { useState } from 'react';
import {
  AlertCircle,
  Ban,
  Check,
  CheckCheck,
  Download,
  FileText,
  Pencil,
  Plus,
  Reply,
  RotateCw,
  Smile,
  Trash2,
} from 'lucide-react';
import {
  CHAT_DELETED_TEXT,
  CHAT_QUICK_REACTIONS,
  chatTimeLabel,
  formatBytes,
  type ChatFile,
  type ChatGif,
  type ChatReaction,
  type ChatReply,
} from '@org/models/chat';
import { EmojiPicker } from './emoji-picker';
import { Popover } from './popover';

export type MessageActions = {
  onReact: (emoji: string) => void;
  onReply: () => void;
  /** Own messages that can still be edited. */
  onEdit?: () => void;
  /** Own messages. */
  onDelete?: () => void;
};

export type MessageBubbleProps = {
  /** Lets quotes jump to this message. */
  id?: string;
  body: string;
  attachments: string[];
  files?: ChatFile[];
  gif?: ChatGif | null;
  replyTo?: ChatReply | null;
  reactions?: ChatReaction[];
  editedAt?: string | null;
  deletedAt?: string | null;
  own: boolean;
  /** Shown above other people's messages when several people can answer. */
  senderName?: string;
  createdAt?: string;
  /** For messages still on their way. */
  status?: 'sending' | { error: string; onRetry: () => void };
  /** For your own sent messages: whether the other side has read it. */
  seen?: boolean;
  /** Your person key, to show which reactions are yours. */
  viewerKey?: string;
  actions?: MessageActions;
  onQuoteClick?: (messageId: string) => void;
};

type Menu = 'react' | 'emoji' | 'delete' | null;

function groupReactions(reactions: ChatReaction[], viewerKey?: string) {
  const groups = new Map<string, { names: string[]; mine: boolean }>();
  for (const { emoji, key, name } of reactions) {
    const group = groups.get(emoji) ?? { names: [], mine: false };
    group.names.push(key === viewerKey ? 'You' : name);
    group.mine ||= key === viewerKey;
    groups.set(emoji, group);
  }
  return [...groups.entries()];
}

/** Keeps the shape of a GIF within the bubble. */
function gifSize(gif: ChatGif) {
  const maxWidth = gif.kind === 'sticker' ? 160 : 240;
  const width = Math.min(gif.width, maxWidth);
  return { width, height: Math.round((gif.height / gif.width) * width) };
}

export function MessageBubble({
  id,
  body,
  attachments,
  files = [],
  gif = null,
  replyTo = null,
  reactions = [],
  editedAt = null,
  deletedAt = null,
  own,
  senderName,
  createdAt,
  status,
  seen,
  viewerKey,
  actions,
  onQuoteClick,
}: MessageBubbleProps) {
  const [menu, setMenu] = useState<Menu>(null);
  const failed = typeof status === 'object';
  const deleted = Boolean(deletedAt);
  const stickerOnly = gif?.kind === 'sticker' && !body && !replyTo;
  const grouped = groupReactions(reactions, viewerKey);
  const canAct = Boolean(actions) && !deleted && !status;

  function react(emoji: string) {
    setMenu(null);
    actions?.onReact(emoji);
  }

  const toolbar = canAct && actions && (
    <div
      className={`relative flex items-center gap-0.5 self-center rounded-full border border-neutral-200 bg-white p-0.5 shadow-sm transition ${
        menu
          ? 'opacity-100'
          : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
      }`}
    >
      <button
        type="button"
        onClick={() => setMenu(menu === 'react' ? null : 'react')}
        aria-label="React"
        aria-expanded={menu === 'react' || menu === 'emoji'}
        className="rounded-full p-1 text-neutral-500 hover:bg-neutral-100 hover:text-brand-start"
      >
        <Smile size={15} />
      </button>
      <button
        type="button"
        onClick={actions.onReply}
        aria-label="Reply"
        className="rounded-full p-1 text-neutral-500 hover:bg-neutral-100 hover:text-brand-start"
      >
        <Reply size={15} />
      </button>
      {actions.onEdit && (
        <button
          type="button"
          onClick={actions.onEdit}
          aria-label="Edit"
          className="rounded-full p-1 text-neutral-500 hover:bg-neutral-100 hover:text-brand-start"
        >
          <Pencil size={15} />
        </button>
      )}
      {actions.onDelete && (
        <button
          type="button"
          onClick={() => setMenu(menu === 'delete' ? null : 'delete')}
          aria-label="Delete"
          aria-expanded={menu === 'delete'}
          className="rounded-full p-1 text-neutral-500 hover:bg-rose-50 hover:text-rose-600"
        >
          <Trash2 size={15} />
        </button>
      )}

      {menu === 'react' && (
        <Popover
          label="Reactions"
          onClose={() => setMenu(null)}
          className={`bottom-full mb-1 flex items-center gap-0.5 rounded-full p-1 ${own ? 'right-0' : 'left-0'}`}
        >
          {CHAT_QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => react(emoji)}
              aria-label={`React with ${emoji}`}
              className="rounded-full p-1 text-lg leading-none transition hover:scale-125 hover:bg-neutral-100"
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMenu('emoji')}
            aria-label="More reactions"
            className="rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100"
          >
            <Plus size={16} />
          </button>
        </Popover>
      )}
      {menu === 'emoji' && (
        <EmojiPicker
          label="Pick a reaction"
          onPick={react}
          onClose={() => setMenu(null)}
          className={`bottom-full mb-1 ${own ? 'right-0' : 'left-0'}`}
        />
      )}
      {menu === 'delete' && (
        <Popover
          label="Delete message"
          onClose={() => setMenu(null)}
          className={`bottom-full mb-1 w-56 p-3 ${own ? 'right-0' : 'left-0'}`}
        >
          <p className="text-sm text-neutral-800">
            Delete this message for everyone?
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMenu(null)}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                actions.onDelete?.();
              }}
              className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700"
            >
              Delete
            </button>
          </div>
        </Popover>
      )}
    </div>
  );

  return (
    <li
      id={id ? `message-${id}` : undefined}
      className={`group flex flex-col ${own ? 'items-end' : 'items-start'}`}
    >
      {senderName && (
        <span className="mb-0.5 px-1 text-xs font-medium text-neutral-500">
          {senderName}
        </span>
      )}
      <div
        className={`flex max-w-[85%] items-end gap-1.5 ${own ? 'flex-row-reverse' : ''}`}
      >
        {deleted ? (
          <div className="flex items-center gap-1.5 rounded-2xl border border-neutral-200 px-3.5 py-2 text-sm text-neutral-500 italic">
            <Ban size={14} aria-hidden />
            {CHAT_DELETED_TEXT}
          </div>
        ) : (
          <div
            className={`min-w-0 text-sm break-words whitespace-pre-wrap ${
              stickerOnly
                ? ''
                : `rounded-2xl ${gif && !body ? 'p-1' : 'px-3.5 py-2'} ${
                    own
                      ? `rounded-br-md bg-brand-start text-white ${status === 'sending' ? 'opacity-70' : ''}`
                      : 'rounded-bl-md bg-neutral-100 text-neutral-900'
                  }`
            } ${failed ? 'rounded-2xl ring-2 ring-rose-400' : ''}`}
          >
            {replyTo && (
              <button
                type="button"
                onClick={() => onQuoteClick?.(replyTo.id)}
                className={`mb-1.5 block w-full rounded-lg border-l-4 px-2.5 py-1 text-left text-xs ${
                  own
                    ? 'border-white/70 bg-white/15 text-white/90'
                    : 'border-brand-start bg-white text-neutral-600'
                }`}
              >
                <span className="block font-semibold">
                  {replyTo.senderName}
                </span>
                <span className="line-clamp-2">{replyTo.preview}</span>
              </button>
            )}
            {attachments.length > 0 && (
              <span
                className={`mb-1 grid gap-1 ${attachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}
              >
                {attachments.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    <img
                      src={url}
                      alt="Attached to the message"
                      loading="lazy"
                      className="max-h-60 w-full rounded-lg object-cover"
                    />
                  </a>
                ))}
              </span>
            )}
            {files.length > 0 && (
              <ul aria-label="Documents" className="mb-1 space-y-1">
                {files.map((file) => (
                  <li key={file.url}>
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      download={file.name}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${
                        own
                          ? 'bg-white/15 hover:bg-white/25'
                          : 'bg-white hover:bg-neutral-50'
                      }`}
                    >
                      <FileText size={22} className="shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {file.name}
                        </span>
                        <span
                          className={`block text-xs ${own ? 'text-white/80' : 'text-neutral-500'}`}
                        >
                          {formatBytes(file.size)}
                        </span>
                      </span>
                      <Download
                        size={16}
                        className="shrink-0"
                        aria-label="Download"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {gif && (
              <img
                src={gif.url}
                alt={gif.title || (gif.kind === 'sticker' ? 'Sticker' : 'GIF')}
                loading="lazy"
                {...gifSize(gif)}
                className="max-w-full rounded-xl"
              />
            )}
            {body}
          </div>
        )}
        {toolbar}
      </div>

      {grouped.length > 0 && (
        <ul
          aria-label="Reactions"
          className={`-mt-1 flex flex-wrap gap-1 px-1 ${own ? 'justify-end' : ''}`}
        >
          {grouped.map(([emoji, { names, mine }]) => (
            <li key={emoji}>
              <button
                type="button"
                onClick={() => actions?.onReact(emoji)}
                disabled={!actions}
                title={names.join(', ')}
                aria-label={`${emoji} ${names.length}: ${names.join(', ')}`}
                aria-pressed={mine}
                className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs shadow-sm ${
                  mine
                    ? 'border-brand-start bg-brand-start/10 text-brand-start'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                <span className="text-sm leading-none">{emoji}</span>
                {names.length}
              </button>
            </li>
          ))}
        </ul>
      )}

      <span className="mt-0.5 flex items-center gap-1 px-1 text-[11px] text-neutral-500">
        {failed ? (
          <span className="flex items-center gap-1 text-rose-600">
            <AlertCircle size={12} />
            {status.error}
            <button
              type="button"
              onClick={status.onRetry}
              className="ml-1 inline-flex items-center gap-0.5 font-medium underline"
            >
              <RotateCw size={11} />
              Retry
            </button>
          </span>
        ) : status === 'sending' ? (
          'Sending…'
        ) : createdAt ? (
          <>
            {chatTimeLabel(createdAt)}
            {editedAt && !deleted && <span>· Edited</span>}
            {own &&
              !deleted &&
              seen !== undefined &&
              (seen ? (
                <CheckCheck
                  size={14}
                  className="text-brand-start"
                  aria-label="Seen"
                  role="img"
                />
              ) : (
                <Check size={14} aria-label="Sent" role="img" />
              ))}
          </>
        ) : null}
      </span>
    </li>
  );
}
