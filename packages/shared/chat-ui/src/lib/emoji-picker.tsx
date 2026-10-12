import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { ALL_EMOJIS, EMOJI_CATEGORIES } from './emoji-data';
import { Popover } from './popover';

const RECENT_KEY = 'mlimalink:recent-emoji';
const MAX_RECENT = 16;
const NAMES = new Map(ALL_EMOJIS.map(([emoji, name]) => [emoji, name]));

function readRecent(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(saved)
      ? saved.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Puts the emoji first in the recently used list. */
export function rememberEmoji(emoji: string) {
  try {
    const recent = [emoji, ...readRecent().filter((item) => item !== emoji)];
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify(recent.slice(0, MAX_RECENT)),
    );
  } catch {
    // Private browsing can refuse storage; recents just aren't kept.
  }
}

/** Searchable emoji grid by category, with recently used ones first. */
export function EmojiPicker({
  onPick,
  onClose,
  label = 'Emoji',
  className = 'bottom-full left-0 mb-2',
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
  label?: string;
  className?: string;
}) {
  const [recent] = useState(readRecent);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState(
    recent.length ? 'recent' : EMOJI_CATEGORIES[0].id,
  );

  const tabs = useMemo(
    () => [
      ...(recent.length
        ? [
            {
              id: 'recent',
              label: 'Recently used',
              emojis: recent.map(
                (emoji) => [emoji, NAMES.get(emoji) ?? ''] as const,
              ),
            },
          ]
        : []),
      ...EMOJI_CATEGORIES,
    ],
    [recent],
  );

  const words = query.trim().toLowerCase();
  const shown = words
    ? ALL_EMOJIS.filter(([, name]) => name.includes(words))
    : (tabs.find((tab) => tab.id === categoryId) ?? tabs[0]).emojis;

  function pick(emoji: string) {
    rememberEmoji(emoji);
    onPick(emoji);
  }

  return (
    <Popover
      label={label}
      onClose={onClose}
      className={`w-72 p-2 ${className}`}
    >
      <label className="relative mb-2 block">
        <span className="sr-only">Search emoji</span>
        <Search
          size={14}
          className="absolute top-1/2 left-2.5 -translate-y-1/2 text-neutral-400"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search emoji"
          autoFocus
          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-1.5 pr-2 pl-8 text-sm outline-none focus:border-brand-start"
        />
      </label>
      {!words && (
        <div
          role="tablist"
          aria-label="Emoji categories"
          className="mb-1 flex gap-0.5"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.id === categoryId}
              title={tab.label}
              aria-label={tab.label}
              onClick={() => setCategoryId(tab.id)}
              className={`flex-1 rounded-md py-1 text-base ${
                tab.id === categoryId
                  ? 'bg-brand-start/10'
                  : 'hover:bg-neutral-100'
              }`}
            >
              {tab.id === 'recent' ? '🕘' : tab.emojis[0][0]}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="py-6 text-center text-xs text-neutral-500">
          No emoji found.
        </p>
      ) : (
        <div className="grid max-h-52 grid-cols-8 gap-0.5 overflow-y-auto">
          {shown.map(([emoji, name]) => (
            <button
              key={emoji}
              type="button"
              title={name.split(' ').slice(0, 2).join(' ')}
              aria-label={emoji}
              onClick={() => pick(emoji)}
              className="rounded-md p-1 text-xl leading-none hover:bg-neutral-100"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
