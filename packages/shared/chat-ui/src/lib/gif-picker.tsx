import { useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import type { ChatGif, GifPage, GifResult } from '@org/models/chat';
import { ChatRequestError } from './chat-api';
import { Popover } from './popover';

export type GifKind = 'gifs' | 'stickers';
export type SearchGifs = (
  kind: GifKind,
  q: string,
  offset?: number,
) => Promise<GifPage>;

const SEARCH_DELAY_MS = 350;

const errorText = (error: unknown) =>
  error instanceof ChatRequestError
    ? error.message
    : 'GIFs couldn’t load. Please try again.';

/** GIPHY GIFs and stickers: trending to start with, or a search. */
export function GifPicker({
  search,
  onPick,
  onClose,
  className = 'bottom-full left-0 mb-2',
}: {
  search: SearchGifs;
  onPick: (gif: ChatGif) => void;
  onClose: () => void;
  className?: string;
}) {
  const [kind, setKind] = useState<GifKind>('gifs');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<GifResult[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    search(kind, debounced)
      .then((page) => {
        if (!current) return;
        setResults(page.results);
        setNext(page.next);
      })
      .catch((reason: unknown) => {
        if (!current) return;
        setResults([]);
        setNext(null);
        setError(errorText(reason));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [search, kind, debounced]);

  function loadMore() {
    if (next === null || loading) return;
    setLoading(true);
    search(kind, debounced, next)
      .then((page) => {
        setResults((shown) => {
          const ids = new Set(shown.map((gif) => gif.id));
          return [...shown, ...page.results.filter((gif) => !ids.has(gif.id))];
        });
        setNext(page.next);
      })
      .catch((reason: unknown) => setError(errorText(reason)))
      .finally(() => setLoading(false));
  }

  const noun = kind === 'gifs' ? 'GIFs' : 'stickers';

  return (
    <Popover
      label="GIFs and stickers"
      onClose={onClose}
      className={`flex w-80 max-w-[calc(100vw-2rem)] flex-col p-2 ${className}`}
    >
      <div role="tablist" aria-label="Kind" className="mb-2 flex gap-1">
        {(['gifs', 'stickers'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={kind === value}
            onClick={() => setKind(value)}
            className={`flex-1 rounded-md py-1 text-xs font-semibold ${
              kind === value
                ? 'bg-brand-start text-white'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            {value === 'gifs' ? 'GIFs' : 'Stickers'}
          </button>
        ))}
      </div>
      <label className="relative mb-2 block">
        <span className="sr-only">Search {noun}</span>
        <Search
          size={14}
          className="absolute top-1/2 left-2.5 -translate-y-1/2 text-neutral-400"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search GIPHY ${noun}`}
          maxLength={50}
          autoFocus
          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-1.5 pr-2 pl-8 text-sm outline-none focus:border-brand-start"
        />
      </label>

      <div className="h-64 overflow-y-auto">
        {error ? (
          <p
            role="alert"
            className="px-2 py-8 text-center text-xs text-rose-600"
          >
            {error}
          </p>
        ) : results.length === 0 && !loading ? (
          <p className="py-8 text-center text-xs text-neutral-500">
            No {noun} found.
          </p>
        ) : (
          <ul aria-label={noun} className="grid grid-cols-3 gap-1">
            {results.map((gif) => (
              <li key={gif.id}>
                <button
                  type="button"
                  onClick={() =>
                    onPick({
                      kind: kind === 'gifs' ? 'gif' : 'sticker',
                      url: gif.url,
                      width: gif.width,
                      height: gif.height,
                      title: gif.title,
                    })
                  }
                  aria-label={
                    gif.title || (kind === 'gifs' ? 'GIF' : 'Sticker')
                  }
                  className={`block h-20 w-full overflow-hidden rounded-md ${
                    kind === 'gifs' ? 'bg-neutral-100' : ''
                  } hover:ring-2 hover:ring-brand-start`}
                >
                  <img
                    src={gif.previewUrl}
                    alt=""
                    loading="lazy"
                    className={`h-full w-full ${kind === 'gifs' ? 'object-cover' : 'object-contain'}`}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
        {loading ? (
          <div className="flex justify-center py-3 text-neutral-400">
            <Loader2
              size={18}
              className="animate-spin"
              aria-label={`Loading ${noun}`}
            />
          </div>
        ) : (
          next !== null &&
          !error && (
            <div className="flex justify-center py-2">
              <button
                type="button"
                onClick={loadMore}
                className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
              >
                More {noun}
              </button>
            </div>
          )
        )}
      </div>
      <p className="mt-1.5 text-right text-[10px] font-semibold tracking-wide text-neutral-400 uppercase">
        Powered by GIPHY
      </p>
    </Popover>
  );
}
