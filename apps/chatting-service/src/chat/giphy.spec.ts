import { clearGifCache, parseGifQuery, searchGifs } from './giphy';

vi.mock('../log', () => ({ log: vi.fn() }));

const item = (id: string, host = 'media1.giphy.com') => ({
  id,
  title: `GIF ${id}`,
  images: {
    fixed_height: {
      url: `https://${host}/media/${id}/200.gif`,
      width: '267',
      height: '200',
    },
    fixed_height_small: {
      url: `https://${host}/media/${id}/100.gif`,
      width: '133',
      height: '100',
    },
  },
});

function giphy(body: unknown, ok = true) {
  return vi.fn(async () => ({
    ok,
    status: ok ? 200 : 429,
    json: async () => body,
  })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  clearGifCache();
  vi.stubEnv('GIPHY_API_KEY', 'key-123');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('parseGifQuery', () => {
  it('defaults to trending GIFs and validates the rest', () => {
    expect(parseGifQuery({})).toEqual({ kind: 'gifs', q: '', offset: 0 });
    expect(
      parseGifQuery({ type: 'stickers', q: ' party ', offset: '24' }),
    ).toEqual({ kind: 'stickers', q: 'party', offset: 24 });

    for (const query of [
      { type: 'videos' },
      { q: 'x'.repeat(51) },
      { offset: '-1' },
      { offset: '1.5' },
      { offset: '9999' },
    ]) {
      expect(() => parseGifQuery(query)).toThrow(
        expect.objectContaining({ status: 400 }),
      );
    }
  });
});

describe('searchGifs', () => {
  it('searches GIPHY with the server’s key and keeps only GIPHY media', async () => {
    const fetchImpl = giphy({
      data: [item('a'), item('b', 'evil.example'), { id: 'c', images: {} }],
      pagination: { total_count: 3 },
    });

    const page = await searchGifs(
      { kind: 'stickers', q: 'party', offset: 0 },
      fetchImpl,
    );

    const url = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe(
      'https://api.giphy.com/v1/stickers/search',
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      api_key: 'key-123',
      q: 'party',
      offset: '0',
      rating: 'pg',
    });
    expect(page).toEqual({
      results: [
        {
          id: 'a',
          title: 'GIF a',
          url: 'https://media1.giphy.com/media/a/200.gif',
          width: 267,
          height: 200,
          previewUrl: 'https://media1.giphy.com/media/a/100.gif',
        },
      ],
      next: null,
    });
  });

  it('shows trending without a search and pages through full results', async () => {
    const fetchImpl = giphy({
      data: Array.from({ length: 24 }, (_, i) => item(`g${i}`)),
      pagination: { total_count: 500 },
    });

    const page = await searchGifs(
      { kind: 'gifs', q: '', offset: 24 },
      fetchImpl,
    );

    expect(fetchImpl.mock.calls[0][0]).toContain('/v1/gifs/trending?');
    expect(page.results).toHaveLength(24);
    expect(page.next).toBe(48);
  });

  it('reuses a recent search instead of asking GIPHY again', async () => {
    const fetchImpl = giphy({ data: [item('a')], pagination: {} });
    const query = { kind: 'gifs' as const, q: 'Cats', offset: 0 };

    await searchGifs(query, fetchImpl, 0);
    await searchGifs({ ...query, q: 'cats' }, fetchImpl, 60_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await searchGifs(query, fetchImpl, 10 * 60_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('says how to set it up without a key', async () => {
    vi.stubEnv('GIPHY_API_KEY', '');
    const fetchImpl = giphy({});

    await expect(
      searchGifs({ kind: 'gifs', q: '', offset: 0 }, fetchImpl),
    ).rejects.toMatchObject({
      status: 503,
      message:
        'GIFs and stickers aren’t set up yet. Add a GIPHY_API_KEY to chatting-service.',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('answers 502 when GIPHY fails', async () => {
    await expect(
      searchGifs({ kind: 'gifs', q: 'x', offset: 0 }, giphy({}, false)),
    ).rejects.toMatchObject({ status: 502 });

    const broken = vi.fn(async () => {
      throw new Error('timeout');
    }) as unknown as typeof fetch;
    await expect(
      searchGifs({ kind: 'gifs', q: 'y', offset: 0 }, broken),
    ).rejects.toMatchObject({ status: 502 });
  });
});
