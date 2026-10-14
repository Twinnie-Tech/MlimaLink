import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@org/models';
import { QueryProvider } from '../src/app/shared/providers/query-provider';
import { ShopStoreProvider } from '../src/app/shared/store/shop-store';
import { RecommendedProducts } from '../src/app/shared/widgets/recommended-products';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const viewedId = 'c'.repeat(24);
const RECOMMENDATIONS_URL = `/api/recommendations?exclude=${viewedId}`;

const lamp: Product = {
  id: 'd'.repeat(24),
  name: 'Desk lamp',
  description: '',
  price: 30,
  category: 'Home',
  imageUrl: 'https://example.com/lamp.jpg',
  inStock: true,
  rating: 4,
  reviewCount: 2,
};

type Reply = { status: number; body: unknown };
const replies = new Map<string, Reply[]>();
const reply = (key: string, body: unknown, status = 200) =>
  replies.set(key, [...(replies.get(key) ?? []), { status, body }]);
const fetchMock = vi.fn();
const requested = (key: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => `${init?.method ?? 'GET'} ${url}` === key,
  ).length;

const signIn = () =>
  reply('GET /api/auth/logged-in-user', {
    success: true,
    user: { id: 'u1', name: 'Amina Kariuki', email: 'a@x.co', role: 'user' },
  });

const renderRow = () =>
  render(
    <QueryProvider>
      <ShopStoreProvider>
        <RecommendedProducts exclude={viewedId} />
      </ShopStoreProvider>
    </QueryProvider>,
  );

beforeEach(() => {
  replies.clear();
  push.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async (url: string, init?: { method?: string }) => {
      const queue = replies.get(`${init?.method ?? 'GET'} ${url}`);
      const { status, body } = (queue && queue.length > 1
        ? queue.shift()
        : queue?.[0]) ?? {
        status: 401,
        body: { success: false, error: 'Unauthorized' },
      };
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      };
    },
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RecommendedProducts', () => {
  it('shows picks for the signed-in shopper and opens them', async () => {
    signIn();
    reply(`GET ${RECOMMENDATIONS_URL}`, { success: true, data: [lamp] });
    renderRow();

    expect(
      await screen.findByRole('heading', { name: 'Recommended for you' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByText('Desk lamp'));
    expect(push).toHaveBeenCalledWith(`/products/${lamp.id}`);
  });

  it('renews an expired session and tries again', async () => {
    signIn();
    reply(`GET ${RECOMMENDATIONS_URL}`, { success: false }, 401);
    reply(`GET ${RECOMMENDATIONS_URL}`, { success: true, data: [lamp] });
    reply('POST /api/auth/refresh-token', { success: true, message: 'ok' });
    renderRow();

    expect(await screen.findByText('Desk lamp')).toBeTruthy();
    expect(requested('POST /api/auth/refresh-token')).toBe(1);
  });

  it('doesn’t ask for recommendations for guests', async () => {
    renderRow();

    await waitFor(() =>
      expect(requested('GET /api/auth/logged-in-user')).toBeGreaterThan(0),
    );
    expect(requested(`GET ${RECOMMENDATIONS_URL}`)).toBe(0);
    expect(screen.queryByText('Recommended for you')).toBeNull();
  });

  it.each([
    ['there are no picks', 200, { success: true, data: [] }],
    ['the service is down', 503, { success: false, data: [] }],
  ])('stays hidden when %s', async (_label, status, body) => {
    signIn();
    reply(`GET ${RECOMMENDATIONS_URL}`, body, status);
    renderRow();

    await waitFor(() =>
      expect(requested(`GET ${RECOMMENDATIONS_URL}`)).toBe(1),
    );
    expect(screen.queryByText('Recommended for you')).toBeNull();
  });
});
