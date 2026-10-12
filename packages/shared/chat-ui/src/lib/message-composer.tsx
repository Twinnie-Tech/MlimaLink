import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Pencil,
  Reply,
  Send,
  Smile,
  Sticker,
  X,
} from 'lucide-react';
import {
  CHAT_FILE_ACCEPT,
  CHAT_MAX_ATTACHMENTS,
  CHAT_MAX_MESSAGE_LENGTH,
  CHAT_TYPING_EVERY_MS,
  chatFileKind,
  chatFileProblem,
  formatBytes,
  type ChatGif,
} from '@org/models/chat';
import { EmojiPicker } from './emoji-picker';
import { GifPicker, type SearchGifs } from './gif-picker';

export type ComposerDraft = {
  body: string;
  /** Photos and documents, checked but not uploaded yet. */
  files: File[];
  gif?: ChatGif;
};

export type MessageComposerProps = {
  /** Resolves true once the message is on its way, so the box can be cleared. */
  onSend: (draft: ComposerDraft) => Promise<boolean>;
  /** Called every few seconds while text is being typed. */
  onTyping?: () => void;
  /** Without it there's no GIF button. */
  searchGifs?: SearchGifs;
  replyingTo?: { senderName: string; preview: string } | null;
  onCancelReply?: () => void;
  /** A message of yours being edited; the box holds its text until saved or cancelled. */
  editing?: { id: string; body: string; canBeEmpty: boolean } | null;
  onSaveEdit?: (body: string) => Promise<boolean>;
  onCancelEdit?: () => void;
  disabled?: boolean;
};

type Picker = 'emoji' | 'gif' | null;

/**
 * Text box with emoji, GIF and sticker pickers and a picker for photos and documents;
 * Enter sends, Shift+Enter starts a new line.
 */
export function MessageComposer({
  onSend,
  onTyping,
  searchGifs,
  replyingTo,
  onCancelReply,
  editing,
  onSaveEdit,
  onCancelEdit,
  disabled,
}: MessageComposerProps) {
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);
  const [editingId, setEditingId] = useState(editing?.id ?? null);
  const [draftBeforeEdit, setDraftBeforeEdit] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typedAtRef = useRef(0);

  // Editing puts the message's text in the box; finishing brings back what was there.
  if ((editing?.id ?? null) !== editingId) {
    setEditingId(editing?.id ?? null);
    if (editing) {
      if (!editingId) setDraftBeforeEdit(body);
      setBody(editing.body);
    } else {
      setBody(draftBeforeEdit);
    }
    setProblem(null);
  }

  const trimmed = body.trim();
  const tooLong = trimmed.length > CHAT_MAX_MESSAGE_LENGTH;
  const canSend =
    !disabled &&
    !sending &&
    !tooLong &&
    (editing
      ? trimmed.length > 0 || editing.canBeEmpty
      : trimmed.length > 0 || files.length > 0);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const picked = [...list];
    const firstProblem = picked.map(chatFileProblem).find(Boolean) ?? null;
    const fine = picked.filter((file) => !chatFileProblem(file));
    const room = CHAT_MAX_ATTACHMENTS - files.length;
    if (fine.length > room) {
      setProblem(
        `You can attach up to ${CHAT_MAX_ATTACHMENTS} photos or documents per message.`,
      );
    } else {
      setProblem(firstProblem);
    }
    setFiles((current) => [...current, ...fine.slice(0, Math.max(room, 0))]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function insertEmoji(emoji: string) {
    const box = textareaRef.current;
    const start = box?.selectionStart ?? body.length;
    const end = box?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + emoji + body.slice(end));
    setPicker(null);
    requestAnimationFrame(() => {
      box?.focus();
      box?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  function handleChange(value: string) {
    setBody(value);
    if (editing || !value.trim() || !onTyping) return;
    const now = Date.now();
    if (now - typedAtRef.current >= CHAT_TYPING_EVERY_MS) {
      typedAtRef.current = now;
      onTyping();
    }
  }

  async function sendGif(gif: ChatGif) {
    setPicker(null);
    setSending(true);
    try {
      await onSend({ body: '', files: [], gif });
    } finally {
      setSending(false);
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    setSending(true);
    try {
      if (editing) {
        await onSaveEdit?.(trimmed);
        return;
      }
      if (await onSend({ body: trimmed, files })) {
        setBody('');
        setFiles([]);
        setProblem(null);
        typedAtRef.current = 0;
      }
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape' && editing) {
      event.preventDefault();
      onCancelEdit?.();
      return;
    }
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void submit();
    }
  }

  const context = editing
    ? {
        icon: <Pencil size={14} />,
        title: 'Editing message',
        text: 'Press Esc to cancel',
        onCancel: onCancelEdit,
        cancelLabel: 'Cancel editing',
      }
    : replyingTo
      ? {
          icon: <Reply size={14} />,
          title: `Replying to ${replyingTo.senderName}`,
          text: replyingTo.preview,
          onCancel: onCancelReply,
          cancelLabel: 'Cancel reply',
        }
      : null;

  return (
    <form onSubmit={submit} className="border-t border-neutral-200 p-3">
      {context && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border-l-4 border-brand-start bg-brand-start/5 px-3 py-1.5">
          <span className="mt-0.5 text-brand-start">{context.icon}</span>
          <span className="min-w-0 flex-1 text-xs">
            <span className="block font-semibold text-neutral-800">
              {context.title}
            </span>
            <span className="block truncate text-neutral-600">
              {context.text}
            </span>
          </span>
          <button
            type="button"
            onClick={context.onCancel}
            aria-label={context.cancelLabel}
            className="rounded p-0.5 text-neutral-500 hover:bg-neutral-200"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {files.length > 0 && !editing && (
        <ul aria-label="Files to send" className="mb-2 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-1.5 rounded-full bg-neutral-100 py-1 pr-1 pl-2.5 text-xs text-neutral-700"
            >
              {chatFileKind(file) === 'photo' ? (
                <ImageIcon size={13} aria-hidden />
              ) : (
                <FileText size={13} aria-hidden />
              )}
              <span className="max-w-40 truncate">{file.name}</span>
              <span className="text-neutral-500">{formatBytes(file.size)}</span>
              <button
                type="button"
                onClick={() =>
                  setFiles((current) => current.filter((_, i) => i !== index))
                }
                aria-label={`Remove ${file.name}`}
                className="rounded-full p-0.5 hover:bg-neutral-200"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-1">
        <input
          ref={fileInputRef}
          type="file"
          accept={CHAT_FILE_ACCEPT}
          multiple
          hidden
          aria-label="Choose photos or documents"
          onChange={(event) => addFiles(event.target.files)}
        />
        {!editing && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || files.length >= CHAT_MAX_ATTACHMENTS}
            aria-label="Attach photos or documents"
            title="Photos or documents, up to 10 MB each"
            className="rounded-lg p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-brand-start disabled:opacity-50"
          >
            <Paperclip size={20} />
          </button>
        )}
        <div className="relative">
          <button
            type="button"
            onClick={() => setPicker(picker === 'emoji' ? null : 'emoji')}
            disabled={disabled}
            aria-label="Emoji"
            aria-expanded={picker === 'emoji'}
            className="rounded-lg p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-brand-start disabled:opacity-50"
          >
            <Smile size={20} />
          </button>
          {picker === 'emoji' && (
            <EmojiPicker onPick={insertEmoji} onClose={() => setPicker(null)} />
          )}
        </div>
        {searchGifs && !editing && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setPicker(picker === 'gif' ? null : 'gif')}
              disabled={disabled || sending}
              aria-label="GIFs and stickers"
              aria-expanded={picker === 'gif'}
              className="rounded-lg p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-brand-start disabled:opacity-50"
            >
              <Sticker size={20} />
            </button>
            {picker === 'gif' && (
              <GifPicker
                search={searchGifs}
                onPick={(gif) => void sendGif(gif)}
                onClose={() => setPicker(null)}
              />
            )}
          </div>
        )}
        <label className="flex-1">
          <span className="sr-only">Message</span>
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={disabled}
            placeholder={editing ? 'Edit your message' : 'Type a message'}
            aria-invalid={tooLong || undefined}
            className="max-h-32 min-h-10.5 w-full resize-none rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-500 focus:border-brand-start disabled:opacity-60"
          />
        </label>
        <button
          type="submit"
          disabled={!canSend}
          aria-label={editing ? 'Save changes' : 'Send message'}
          className="rounded-lg bg-brand-start p-2.5 text-white transition hover:bg-brand-end disabled:opacity-50"
        >
          {sending ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <Send size={20} />
          )}
        </button>
      </div>

      {(problem || trimmed.length > CHAT_MAX_MESSAGE_LENGTH - 200) && (
        <p
          role={problem || tooLong ? 'alert' : undefined}
          className={`mt-1.5 text-xs ${problem || tooLong ? 'text-rose-600' : 'text-neutral-500'}`}
        >
          {problem ??
            `${trimmed.length} / ${CHAT_MAX_MESSAGE_LENGTH} characters`}
        </p>
      )}
    </form>
  );
}
