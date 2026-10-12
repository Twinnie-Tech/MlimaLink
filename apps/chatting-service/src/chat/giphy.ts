import { HttpError } from '../http-error';
import { log } from '../log';
import { isGiphyUrl } from './protocol';

export type GifKind = 'gifs' | 'stickers';

export interface GifResult {
  id: string;
  title: string;
  url: string;
  width: number;
  height: number;
  previewUrl: string;
}

export interface GifPage {
  results: GifResult[];
  next: number | null;
}

const PAGE_SIZE = 24;
const MAX_QUERY_LENGTH = 50;
const MAX_OFFSET = 4999;
/** GIPHY's free keys allow few requests an hour, so the same search is reused for a while. */
const CACHE_MS = 5 * 60_000;
const CACHE_SIZE = 200;

type Rendition = { url?: string; width?: string; height?: string };
type GiphyItem = {
  id?: string;
  title?: string;
  images?: Record<string, Rendition | undefined>;
};

const cache = new Map<string, { at: number; page: GifPage }>();

/** Validates `?type=gifs|stickers&q=&offset=` for a search; an empty query is trending. */
export function parseGifQuery(query: Record<string, unknown>): {
  kind: GifKind;
  q: string;
  offset: number;
} {
  const kind = query.type ?? 'gifs';
  if (kind !== 'gifs' && kind !== 'stickers') {
    throw new HttpError(400, 'type must be gifs or stickers.');
  }
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  if (q.length > MAX_QUERY_LENGTH) {
    throw new HttpError(
      400,
      `Search for up to ${MAX_QUERY_LENGTH} characters.`,
    );
  }
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) {
    throw new HttpError(400, 'offset must be a whole number.');
  }
  return { kind, q, offset };
}

function toResult(item: GiphyItem): GifResult | null {
  const full = item.images?.fixed_height;
  const preview = item.images?.fixed_height_small ?? full;
  const width = Number(full?.width);
  const height = Number(full?.height);
  if (
    typeof item.id !== 'string' ||
    !isGiphyUrl(full?.url) ||
    !isGiphyUrl(preview?.url) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    return null;
  }
  return {
    id: item.id,
    title: (item.title ?? '').slice(0, 200),
    url: full.url as string,
    width,
    height,
    previewUrl: preview?.url as string,
  };
}

/** GIFs or stickers from GIPHY: a search, or what's trending when `q` is empty. */
export async function searchGifs(
  { kind, q, offset }: { kind: GifKind; q: string; offset: number },
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<GifPage> {
  const apiKey = process.env.GIPHY_API_KEY?.trim();
  if (!apiKey) {
    throw new HttpError(
      503,
      'GIFs and stickers aren’t set up yet. Add a GIPHY_API_KEY to chatting-service.',
    );
  }
  const cacheKey = `${kind}|${q.toLowerCase()}|${offset}`;
  const cached = cache.get(cacheKey);
  if (cached && now - cached.at < CACHE_MS) return cached.page;

  const params = new URLSearchParams({
    api_key: apiKey,
    limit: String(PAGE_SIZE),
    offset: String(offset),
    rating: 'pg',
    ...(q && { q, lang: 'en' }),
  });
  const url = `https://api.giphy.com/v1/${kind}/${q ? 'search' : 'trending'}?${params}`;

  let data: {
    data?: GiphyItem[];
    pagination?: { total_count?: number; count?: number; offset?: number };
  };
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`GIPHY answered ${response.status}`);
    data = (await response.json()) as typeof data;
  } catch (error) {
    log('warn', 'GIPHY search failed.', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new HttpError(
      502,
      'GIPHY isn’t responding right now. Please try again.',
    );
  }

  const items = Array.isArray(data.data) ? data.data : [];
  const results = items.flatMap((item) => toResult(item) ?? []);
  const total = data.pagination?.total_count ?? 0;
  const nextOffset = offset + items.length;
  const page: GifPage = {
    results,
    next:
      items.length === PAGE_SIZE &&
      nextOffset < total &&
      nextOffset <= MAX_OFFSET
        ? nextOffset
        : null,
  };

  if (cache.size >= CACHE_SIZE) {
    cache.delete(cache.keys().next().value as string);
  }
  cache.set(cacheKey, { at: now, page });
  return page;
}

/** For tests. */
export function clearGifCache() {
  cache.clear();
}
