import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ProductDetailProps } from '@org/shop-feature-product-detail';
import type { PaginatedResponse, Product, ProductFacets } from '@org/models';
import ProductsPage from '../src/app/products/page';
import ProductDetailPage from '../src/app/products/[id]/page';
import { QueryProvider } from '../src/app/shared/providers/query-provider';
import { ShopStoreProvider } from '../src/app/shared/store/shop-store';
import { readProductFilter } from '../src/app/shared/widgets/product-browser';
import { pageNumbers } from '../src/app/shared/widgets/pagination';
import { sendKafkaEvent } from '../src/actions/track-user';

vi.mock('../src/actions/track-user', () => ({
  sendKafkaEvent: vi.fn().mockResolvedValue(true),
}));

const push = vi.fn();
const replace = vi.fn();
const navigation = { search: '', id: '42' };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  useParams: () => ({ id: navigation.id }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const testProduct: Product = {
  id: '7',
  name: 'Test product',
  description: '',
  price: 1,
  category: 'Test',
  imageUrl: '',
  inStock: true,
  rating: 5,
  reviewCount: 1,
};

vi.mock('@org/shop-feature-product-detail', () => ({
  ProductDetail: ({
    productId,
    onBack,
    onAddToCart,
    isWishlisted,
  }: ProductDetailProps) => (
    <div>
      <p>
        detail {productId} wishlisted: {String(isWishlisted)}
      </p>
      <button onClick={onBack}>back</button>
      <button onClick={() => onAddToCart?.({ ...testProduct, id: '42' })}>
        add to cart
      </button>
    </div>
  ),
}));

const shoes: Product = {
  ...testProduct,
  id: 'p1',
  name: 'Trail shoes',
  price: 50,
  salePrice: 40,
  category: 'Sports',
  options: [
    {
      name: 'Colour',
      values: [
        { label: 'Black', swatch: '#111111' },
        { label: 'Red', swatch: '#dc2626' },
      ],
    },
  ],
};
const lamp: Product = {
  ...testProduct,
  id: 'p2',
  name: 'Desk lamp',
  price: 30,
};

const facets: ProductFacets = {
  categories: ['Electronics', 'Sports'],
  subCategories: [],
  colors: [
    { label: 'Black', swatch: '#111111' },
    { label: 'Red', swatch: '#dc2626' },
  ],
  sizes: ['M', 'L'],
  minPrice: 10,
  maxPrice: 400,
};

const productsPage = (
  items: Product[],
  overrides: Partial<PaginatedResponse<Product>> = {},
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

type Reply = { status: number; body: unknown };
const replies = new Map<string, Reply>();
const reply = (url: string, body: unknown, status = 200) =>
  replies.set(url, { status, body });
const fetchMock = vi.fn();
const requestedUrls = () => fetchMock.mock.calls.map(([url]) => url as string);

function renderWithStore(ui: React.ReactElement) {
  return render(
    <QueryProvider>
      <ShopStoreProvider>{ui}</ShopStoreProvider>
    </QueryProvider>,
  );
}

describe('user-ui product pages', () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    navigation.search = '';
    navigation.id = '42';
    localStorage.clear();
    replies.clear();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      const { status, body } = replies.get(url) ?? {
        status: 404,
        body: { success: false, error: 'Not found' },
      };
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    reply('/api/products/facets', { success: true, data: facets });
    reply('/api/products/offers', { success: true, data: [shoes] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists products with a count, offers banner and links to each product', async () => {
    reply(
      '/api/products?page=1&pageSize=12',
      productsPage([shoes, lamp], { total: 14, totalPages: 2 }),
    );
    renderWithStore(<ProductsPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Our Products' }),
    ).toBeTruthy();
    expect(await screen.findByText('Showing 2 of 14 products')).toBeTruthy();

    const banner = await screen.findByRole('region', { name: 'Top deals' });
    expect(within(banner).getByText('20% off')).toBeTruthy();
    expect(
      within(banner)
        .getByRole('link', { name: 'Shop this deal' })
        .getAttribute('href'),
    ).toBe('/products/p1');
    expect(
      within(banner)
        .getByRole('link', { name: 'See all offers' })
        .getAttribute('href'),
    ).toBe('/products?sale=1');

    fireEvent.click(
      screen.getByRole('button', { name: 'View details for Desk lamp' }),
    );
    expect(push).toHaveBeenCalledWith('/products/p2');
  });

  it('sends the filters in the URL to the API and hides the banner', async () => {
    navigation.search =
      'search=shoes&category=Sports&colors=Black,Red&minPrice=25&maxPrice=50&sale=1&sort=price_asc&page=2';
    reply(
      '/api/products?searchTerm=shoes&category=Sports&minPrice=25&maxPrice=50&colors=Black%2CRed&onSale=true&sort=price_asc&page=2&pageSize=12',
      productsPage([shoes], { total: 13, page: 2, totalPages: 2 }),
    );
    reply('/api/products/facets?category=Sports&searchTerm=shoes', {
      success: true,
      data: facets,
    });
    renderWithStore(<ProductsPage />);

    expect(await screen.findByText(/Showing 1 of 13 products/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Top deals' })).toBeNull();
    expect(requestedUrls()).not.toContain('/api/products/offers');

    const chips = screen.getByRole('list', { name: 'Active filters' });
    for (const label of [
      '“shoes”',
      'Sports',
      '$25.00 – $50.00',
      'Black',
      'Red',
      'On sale',
    ]) {
      expect(
        within(chips).getByRole('button', { name: `Remove filter ${label}` }),
      ).toBeTruthy();
    }
    expect((screen.getByLabelText('Sort by') as HTMLSelectElement).value).toBe(
      'price_asc',
    );
    expect(
      screen
        .getByRole('button', { name: 'Page 2' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('updates the URL as filters change, starting again from page 1', async () => {
    navigation.search = 'search=shoes&page=2';
    reply(
      '/api/products?searchTerm=shoes&page=2&pageSize=12',
      productsPage([shoes], { total: 13, page: 2, totalPages: 2 }),
    );
    reply('/api/products/facets?searchTerm=shoes', {
      success: true,
      data: facets,
    });
    renderWithStore(<ProductsPage />);
    await screen.findByText(/Showing 1 of 13 products/);

    fireEvent.change(screen.getByLabelText('Filter by category'), {
      target: { value: 'Sports' },
    });
    expect(replace).toHaveBeenLastCalledWith(
      '/products?search=shoes&category=Sports',
      { scroll: false },
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Red' }));
    expect(replace).toHaveBeenLastCalledWith(
      '/products?search=shoes&colors=Red',
      { scroll: false },
    );

    fireEvent.click(screen.getByRole('button', { name: 'L' }));
    expect(replace).toHaveBeenLastCalledWith('/products?search=shoes&sizes=L', {
      scroll: false,
    });

    fireEvent.click(screen.getByRole('button', { name: '$25.00 – $50.00' }));
    expect(replace).toHaveBeenLastCalledWith(
      '/products?search=shoes&minPrice=25&maxPrice=50',
      { scroll: false },
    );

    fireEvent.click(screen.getByRole('button', { name: '4 stars and up' }));
    expect(replace).toHaveBeenLastCalledWith(
      '/products?search=shoes&rating=4',
      { scroll: false },
    );

    fireEvent.click(screen.getByLabelText('In stock only'));
    expect(replace).toHaveBeenLastCalledWith(
      '/products?search=shoes&inStock=1',
      { scroll: false },
    );

    fireEvent.change(screen.getByLabelText('Sort by'), {
      target: { value: 'rating' },
    });
    expect(replace).toHaveBeenLastCalledWith(
      '/products?search=shoes&sort=rating',
      { scroll: false },
    );

    fireEvent.click(screen.getByRole('button', { name: /Previous/ }));
    expect(replace).toHaveBeenLastCalledWith('/products?search=shoes&page=1', {
      scroll: true,
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove filter “shoes”' }),
    );
    expect(replace).toHaveBeenLastCalledWith('/products', { scroll: false });
  });

  it('applies a custom price range, swapping min and max when reversed', async () => {
    reply('/api/products?page=1&pageSize=12', productsPage([lamp]));
    renderWithStore(<ProductsPage />);
    await screen.findByText('Showing 1 of 1 products');

    fireEvent.change(screen.getByLabelText('Min'), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText('Max'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));

    expect(replace).toHaveBeenLastCalledWith(
      '/products?minPrice=20&maxPrice=80',
      { scroll: false },
    );
  });

  it('offers to clear filters when nothing matches', async () => {
    navigation.search = 'colors=Purple';
    reply('/api/products?colors=Purple&page=1&pageSize=12', productsPage([]));
    renderWithStore(<ProductsPage />);

    expect(
      await screen.findByText('No products match these filters'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(replace).toHaveBeenLastCalledWith('/products', { scroll: false });
  });

  it('wires wishlist toggles on the cards to the store', async () => {
    reply('/api/products?page=1&pageSize=12', productsPage([lamp]));
    renderWithStore(<ProductsPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Add Desk lamp to wishlist' }),
    );
    expect(
      screen
        .getByRole('button', { name: 'Remove Desk lamp from wishlist' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('passes the route id to ProductDetail and navigates back to the list', () => {
    renderWithStore(<ProductDetailPage />);

    expect(screen.getByText('detail 42 wishlisted: false')).toBeTruthy();
    fireEvent.click(screen.getByText('back'));

    expect(push).toHaveBeenCalledWith('/products');
    expect(screen.queryByRole('heading', { name: 'Reviews' })).toBeNull();
  });

  it('reports a product view once for a signed-in shopper', async () => {
    const productId = 'c'.repeat(24);
    navigation.id = productId;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith(`/api/products/${productId}/reviews`)
          ? Response.json({
              success: true,
              data: {
                items: [],
                total: 0,
                page: 1,
                pageSize: 5,
                totalPages: 0,
                summary: { average: 0, count: 0, breakdown: [0, 0, 0, 0, 0] },
              },
            })
          : Response.json({
              success: true,
              user: { id: 'a'.repeat(24), name: 'Amina', email: 'a@x.co' },
            }),
      ),
    );
    vi.mocked(sendKafkaEvent).mockClear();

    const { rerender } = renderWithStore(<ProductDetailPage />);
    await waitFor(() =>
      expect(sendKafkaEvent).toHaveBeenCalledWith({
        action: 'product_view',
        productId,
      }),
    );
    rerender(
      <QueryProvider>
        <ShopStoreProvider>
          <ProductDetailPage />
        </ShopStoreProvider>
      </QueryProvider>,
    );

    expect(sendKafkaEvent).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(
        'No reviews yet. Be the first to review this product.',
      ),
    ).toBeTruthy();
  });
});

describe('readProductFilter', () => {
  it('reads every filter and ignores invalid values', () => {
    expect(
      readProductFilter(
        new URLSearchParams(
          'search= tv &category=Electronics&sub=TVs&minPrice=10&maxPrice=abc&colors=Black,,Red&sizes=M&rating=9&sale=1&inStock=1&sort=bogus',
        ),
      ),
    ).toEqual({
      searchTerm: 'tv',
      category: 'Electronics',
      subCategory: 'TVs',
      minPrice: 10,
      colors: ['Black', 'Red'],
      sizes: ['M'],
      onSale: true,
      inStock: true,
    });
  });

  it('only keeps a sub-category alongside its category', () => {
    expect(readProductFilter(new URLSearchParams('sub=TVs'))).toEqual({});
  });
});

describe('pageNumbers', () => {
  it('shows every page when there are few', () => {
    expect(pageNumbers(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it('marks gaps around the current page', () => {
    expect(pageNumbers(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
    expect(pageNumbers(1, 12)).toEqual([1, 2, null, 12]);
  });

  it('fills a gap of one page instead of showing an ellipsis', () => {
    expect(pageNumbers(4, 12)).toEqual([1, 2, 3, 4, 5, null, 12]);
  });
});
