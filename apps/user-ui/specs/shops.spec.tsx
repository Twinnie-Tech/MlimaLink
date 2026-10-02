import type { ReactElement } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PaginatedResponse,
  Product,
  ShopDetail,
  ShopSummary,
} from '@org/models';
import ShopPage from '../src/app/shops/[id]/page';
import ShopsPage from '../src/app/shops/page';
import { QueryProvider } from '../src/app/shared/providers/query-provider';
import { ShopStoreProvider } from '../src/app/shared/store/shop-store';

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => '/shops',
  useSearchParams: () => searchParams,
  useParams: () => ({ id: 'shop1' }),
}));

type Reply = { status: number; body: unknown };
const fetchMock = vi.fn();
const replies = new Map<string, Reply>();

/** Sets the reply for `GET url`. Other requests answer 404. */
const reply = (url: string, status: number, body: unknown) =>
  replies.set(url, { status, body });

const requestedUrls = () => fetchMock.mock.calls.map(([url]) => url as string);

const farm: ShopSummary = {
  id: 'shop1',
  name: 'Mlima Farm',
  bio: 'Honey and fresh produce from the slopes of Mt Kenya.',
  category: 'Food & Groceries',
  address: 'Gakere Road',
  deliveryZone: 'Nyeri',
  rating: 4.5,
  reviewCount: 12,
  productCount: 8,
  openingHours: [],
  createdAt: '2026-03-15T10:00:00.000Z',
};

const tailor: ShopSummary = {
  ...farm,
  id: 'shop2',
  name: 'Wanjiku Tailors',
  bio: undefined,
  category: 'Fashion',
  rating: 0,
  reviewCount: 0,
  productCount: 1,
};

const shopsPage = (
  items: ShopSummary[],
  overrides: Partial<PaginatedResponse<ShopSummary>> = {},
) => ({
  success: true,
  data: {
    items,
    total: items.length,
    page: 1,
    pageSize: 12,
    totalPages: 1,
    ...overrides,
  },
});

const product = (id: string, name: string): Product => ({
  id,
  name,
  description: '',
  price: 10,
  category: 'Food & Groceries',
  subCategory: id === 'p1' ? 'Honey' : 'Vegetables',
  imageUrl: '/images/item.jpg',
  inStock: id !== 'p2',
  rating: 0,
  reviewCount: 0,
  shopId: 'shop1',
  shopName: 'Mlima Farm',
});

const detail: ShopDetail = {
  ...farm,
  website: 'https://mlimafarm.co.ke',
  socialLinks: [{ platform: 'instagram', url: 'https://instagram.com/mlima' }],
  openingHours: [
    { day: 'mon', open: '08:00', close: '17:00' },
    { day: 'tue', open: '08:00', close: '17:00' },
    { day: 'sat', open: '09:00', close: '13:00' },
  ],
  deliveryFee: 3,
  isProvider: true,
  products: [
    product('p1', 'Forest honey'),
    product('p2', 'Kale bunch'),
    ...['Carrots', 'Spinach', 'Tomatoes', 'Onions', 'Avocados'].map(
      (name, index) => product(`p${index + 3}`, name),
    ),
  ],
};

const renderPage = (ui: ReactElement) =>
  render(
    <QueryProvider>
      <ShopStoreProvider>{ui}</ShopStoreProvider>
    </QueryProvider>,
  );

beforeEach(() => {
  searchParams = new URLSearchParams();
  replace.mockReset();
  replies.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    const { status, body } = replies.get(url) ?? {
      status: 404,
      body: { success: false, error: 'Shop not found' },
    };
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Shops page', () => {
  it('lists shops with their rating, listings and link', async () => {
    reply('/api/shops?page=1&pageSize=12', 200, shopsPage([farm, tailor]));
    renderPage(<ShopsPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Shops' }),
    ).toBeTruthy();
    const list = await screen.findByRole('list', { name: 'Shops' });
    const cards = within(list).getAllByRole('link');
    expect(cards.map((card) => card.getAttribute('href'))).toEqual([
      '/shops/shop1',
      '/shops/shop2',
    ]);
    expect(within(cards[0]).getByText('4.5')).toBeTruthy();
    expect(within(cards[0]).getByText('(12 reviews)')).toBeTruthy();
    expect(within(cards[0]).getByText('8 listings')).toBeTruthy();
    expect(within(cards[1]).getByText('New shop')).toBeTruthy();
    expect(within(cards[1]).getByText('1 listing')).toBeTruthy();
    expect(screen.getByText('2 shops')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Open your shop' }).getAttribute('href'),
    ).toBe('/become-seller');
  });

  it('sends the filters from the URL and updates them', async () => {
    searchParams = new URLSearchParams('search=honey&zone=Nyeri&page=2');
    reply(
      '/api/shops?search=honey&zone=Nyeri&page=2&pageSize=12',
      200,
      shopsPage([farm], { total: 13, page: 2, totalPages: 2 }),
    );
    renderPage(<ShopsPage />);

    expect(
      await screen.findByText('13 shops around Nyeri matching “honey”'),
    ).toBeTruthy();
    expect(screen.getByText('Page 2 of 2')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: /Next/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Previous/ }));
    expect(replace).toHaveBeenLastCalledWith(
      '/shops?search=honey&zone=Nyeri&page=1',
      { scroll: true },
    );

    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'Fashion' },
    });
    expect(replace).toHaveBeenLastCalledWith(
      '/shops?search=honey&zone=Nyeri&category=Fashion',
      { scroll: false },
    );

    fireEvent.change(screen.getByLabelText('Search shops'), {
      target: { value: '  Mama Nyeri ' },
    });
    fireEvent.submit(screen.getByRole('search'));
    expect(replace).toHaveBeenLastCalledWith(
      '/shops?search=Mama%20Nyeri&zone=Nyeri',
      { scroll: false },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(replace).toHaveBeenLastCalledWith('/shops', { scroll: false });
  });

  it('says when nothing matches the filters', async () => {
    searchParams = new URLSearchParams('category=Fashion');
    reply('/api/shops?category=Fashion&page=1&pageSize=12', 200, shopsPage([]));
    renderPage(<ShopsPage />);

    expect(await screen.findByText('No shops match your search')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'See all shops' }).getAttribute('href'),
    ).toBe('/shops');
  });

  it('invites sellers when there are no shops yet', async () => {
    reply('/api/shops?page=1&pageSize=12', 200, shopsPage([]));
    renderPage(<ShopsPage />);

    expect(await screen.findByText('No shops yet')).toBeTruthy();
    expect(requestedUrls()).toEqual(['/api/shops?page=1&pageSize=12']);
  });
});

describe('Shop page', () => {
  it('shows the shop, its products, hours and delivery', async () => {
    reply('/api/shops/shop1', 200, { success: true, data: detail });
    renderPage(<ShopPage />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mlima Farm' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /Forest honey/ }).getAttribute('href'),
    ).toBe('/products/p1');
    expect(screen.getByText('Out of stock')).toBeTruthy();
    expect(screen.getByText(farm.bio as string)).toBeTruthy();
    expect(screen.getByText('Mon – Tue: 08:00 – 17:00')).toBeTruthy();
    expect(screen.getByText('Sat: 09:00 – 13:00')).toBeTruthy();
    expect(screen.getByText('$3.00 per order')).toBeTruthy();
    expect(screen.getByText('On MlimaLink since March 2026')).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: /Services profile/ })
        .getAttribute('href'),
    ).toBe('/providers/shop1');
    expect(
      screen.getByRole('link', { name: /Instagram/ }).getAttribute('href'),
    ).toBe('https://instagram.com/mlima');
    expect(
      screen.getByText('Showing the newest 7 of 8 listings.'),
    ).toBeTruthy();
  });

  it('searches within the shop and saves to the wishlist', async () => {
    reply('/api/shops/shop1', 200, { success: true, data: detail });
    renderPage(<ShopPage />);

    const search = await screen.findByLabelText('Search this shop');
    fireEvent.change(search, { target: { value: 'honey' } });
    expect(screen.getByRole('link', { name: /Forest honey/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Kale bunch/ })).toBeNull();

    fireEvent.change(search, { target: { value: 'mangoes' } });
    expect(
      screen.getByText('Nothing in this shop matches “mangoes”.'),
    ).toBeTruthy();

    fireEvent.change(search, { target: { value: '' } });
    const save = screen.getByRole('button', {
      name: 'Save Forest honey to wishlist',
    });
    fireEvent.click(save);
    expect(save.getAttribute('aria-pressed')).toBe('true');
    expect(save.getAttribute('aria-label')).toBe(
      'Remove Forest honey from wishlist',
    );
  });

  it('explains when the shop does not exist', async () => {
    renderPage(<ShopPage />);

    expect(await screen.findByText('Shop not found')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Browse shops' }).getAttribute('href'),
    ).toBe('/shops');
  });
});
