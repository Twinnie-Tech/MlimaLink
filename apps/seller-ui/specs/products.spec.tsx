import type { ReactElement } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@org/models';
import DashboardLayout from '../src/app/dashboard/layout';
import AllProductsPage from '../src/app/dashboard/all-products/page';
import CreateProductPage from '../src/app/dashboard/create-product/page';
import {
  fetchMock,
  fill,
  installFetchMock,
  renderPage,
  reply,
  seller,
  sentBody,
  shop,
} from './test-utils';

let pathname = '/dashboard/create-product';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => pathname,
}));

// The editor has its own spec; here a textarea stands in so fields can be filled.
vi.mock('../src/app/shared/dashboard/product-form/rich-text-editor', () => ({
  RichTextEditor: (props: {
    id: string;
    value: string;
    onChange: (html: string) => void;
    footer?: string;
  }) => (
    <>
      <textarea
        id={props.id}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
      <span>{props.footer}</span>
    </>
  ),
}));

vi.mock('../src/app/shared/utils/image', () => ({
  photoToDataUrl: vi.fn(async () => 'data:image/jpeg;base64,/9j/4AAQ'),
}));

let objectUrls = 0;

beforeEach(() => {
  pathname = '/dashboard/create-product';
  installFetchMock();
  reply('GET /api/auth/logged-in-seller', 200, {
    success: true,
    seller: { ...seller, shop },
  });
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => `blob:photo-${++objectUrls}`,
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDashboard(page: ReactElement) {
  return renderPage(<DashboardLayout>{page}</DashboardLayout>);
}

const select = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const toggle = (group: string, value: string) =>
  fireEvent.click(
    within(screen.getByRole('group', { name: `${group} values` })).getByRole(
      'button',
      { name: value },
    ),
  );

async function openShoeTemplate() {
  renderDashboard(<CreateProductPage />);
  await screen.findByRole('button', { name: 'Save product' });
  select('Category', 'Fashion');
  select('Sub-category', 'Shoes');
}

const PHOTO_URL = 'https://ik.imagekit.io/mlima/products/shop1/loafer_a1.jpg';

function pickPhoto() {
  fireEvent.change(screen.getByLabelText('Upload product images'), {
    target: {
      files: [new File(['photo'], 'loafer.jpg', { type: 'image/jpeg' })],
    },
  });
}

/** Picks a photo and waits for it to reach ImageKit. */
async function addPhoto() {
  reply('POST /api/seller/product-images', 200, {
    success: true,
    data: { fileId: 'file1', url: PHOTO_URL },
  });
  pickPhoto();
  await waitFor(() =>
    expect(screen.queryByText('Uploading image 1')).toBeNull(),
  );
}

const imageRequests = (method: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) =>
      String(url).startsWith('/api/seller/product-images') &&
      (init?.method ?? 'GET') === method,
  );

// These fill in a whole listing, which outlasts the 5s default on busy CI runners.
describe('Create product', { timeout: 20_000 }, () => {
  it('asks for the basics before saving', async () => {
    renderDashboard(<CreateProductPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Save product' }),
    );

    expect(await screen.findByText('Product title is required')).toBeTruthy();
    expect(screen.getByText('Choose a sub-category')).toBeTruthy();
    expect(screen.getByText('Add at least one product image.')).toBeTruthy();
    expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe(
      'Fruits & Vegetables',
    );
    expect(
      screen.getByText(
        'Choose a sub-category to see the options shoppers usually pick for it.',
      ),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/seller/products',
      expect.anything(),
    );
  });

  it('offers the colours, sizes and details that suit the sub-category', async () => {
    await openShoeTemplate();

    expect(screen.getByRole('group', { name: 'Colour values' })).toBeTruthy();
    expect(
      within(screen.getByRole('group', { name: 'Size values' }))
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(Array.from({ length: 13 }, (_, i) => String(35 + i)));
    expect(screen.getByLabelText('Brand')).toBeTruthy();
    expect(screen.getByLabelText('Material')).toBeTruthy();
    expect(screen.getByLabelText('Gender')).toBeTruthy();

    select('Sub-category', 'Bags');
    expect(screen.queryByRole('group', { name: 'Size values' })).toBeNull();
  });

  it('sets up house listings with unit types, monthly rent and contact by phone', async () => {
    renderDashboard(<CreateProductPage />);
    await screen.findByRole('button', { name: 'Save product' });
    select('Category', 'Property');
    select('Sub-category', 'Houses for rent');

    expect(
      within(screen.getByRole('group', { name: 'Unit type values' }))
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      'Bedsitter',
      'Studio',
      '1 bedroom',
      '2 bedrooms',
      '3 bedrooms',
      '4 bedrooms',
      '5+ bedrooms',
    ]);
    expect(screen.getByLabelText('House type')).toBeTruthy();
    expect(screen.getByLabelText('Location')).toBeTruthy();
    expect(screen.getByLabelText('Price per month (USD)')).toBeTruthy();
    expect(screen.getByLabelText('Units available')).toBeTruthy();
    expect(
      screen.getByText(/Shoppers will call, WhatsApp or email you/),
    ).toBeTruthy();
    expect(
      screen.queryByRole('group', { name: 'How shoppers can pay' }),
    ).toBeNull();

    select('Sub-category', 'Houses for sale');
    expect(screen.getByLabelText('Price (USD)')).toBeTruthy();
    expect(screen.getByLabelText('Title deed')).toBeTruthy();
  });

  it('builds a stock table for every combination the seller ticks', async () => {
    await openShoeTemplate();

    toggle('Colour', 'Black');
    toggle('Colour', 'Brown');
    toggle('Size', '41');
    toggle('Size', '42');

    expect(
      within(screen.getByRole('group', { name: 'Colour values' }))
        .getByRole('button', { name: 'Black' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.queryByLabelText('Stock')).toBeNull();
    expect(screen.getAllByRole('row')).toHaveLength(5);

    fill('Stock for all', '5');
    fireEvent.click(screen.getByRole('button', { name: 'Apply to all 4' }));
    expect(
      (screen.getByLabelText('Brown / 42 stock') as HTMLInputElement).value,
    ).toBe('5');
    expect(screen.getByText('20 units in stock')).toBeTruthy();

    fill('New Colour value', 'Olive');
    fireEvent.click(screen.getByRole('button', { name: 'Add to Colour' }));
    expect(screen.getByLabelText('Olive / 41 stock')).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(7);
  });

  it('highlights combinations without stock', async () => {
    await openShoeTemplate();
    toggle('Size', '41');
    toggle('Size', '42');
    fill('41 stock', '3');

    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));

    expect(
      await screen.findByText(
        'Some details need fixing. Check the highlighted fields.',
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('42 stock').getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(screen.getByLabelText('41 stock').getAttribute('aria-invalid')).toBe(
      'false',
    );
  });

  it('saves the product with its options, variants and details', async () => {
    reply('POST /api/seller/products', 401, {
      success: false,
      error: 'Unauthorized! Token expired or invalid.',
    });
    reply('POST /api/auth/refresh-token/seller', 200, {
      success: true,
      message: 'ok',
    });
    reply('POST /api/seller/products', 200, {
      success: true,
      message: 'Leather loafers is now listed in Mlima Fresh.',
      data: { id: 'p1' },
    });
    await openShoeTemplate();

    await addPhoto();
    expect(sentBody('POST /api/seller/product-images')).toEqual({
      fileName: 'loafer.jpg',
      file: 'data:image/jpeg;base64,/9j/4AAQ',
    });
    fill('Product title', 'Leather loafers');
    fill('Short description', 'Hand-stitched loafers');
    fill(
      'Description',
      '<p><span style="font-family: Georgia, serif">Soft</span> full-grain leather loafers made in <strong>Nairobi</strong>.</p>',
    );
    expect(screen.getByText(/^7 words · 48\/5000 characters$/)).toBeTruthy();
    fill('Tags', 'leather, formal');
    fill('Price (USD)', '45');
    fill('Brand', 'Mlima');
    toggle('Colour', 'Black');
    toggle('Size', '41');
    toggle('Size', '42');
    fill('Black / 41 stock', '3');
    fill('Black / 42 stock', '0');
    fill('Black / 42 price', '50');
    fill('Black / 42 SKU', 'BLK-42');
    expect(
      (screen.getByLabelText(/Full payment upfront/) as HTMLInputElement)
        .checked,
    ).toBe(true);
    fireEvent.click(screen.getByLabelText(/Cash on delivery/));

    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));

    expect((await screen.findByRole('status')).textContent).toContain(
      'Leather loafers is now listed in Mlima Fresh.',
    );
    expect(
      screen
        .getByRole('link', { name: 'View all products' })
        .getAttribute('href'),
    ).toBe('/dashboard/all-products');

    const body = sentBody('POST /api/seller/products');
    expect(body).toMatchObject({
      title: 'Leather loafers',
      description:
        '<p><span style="font-family: Georgia, serif">Soft</span> full-grain leather loafers made in <strong>Nairobi</strong>.</p>',
      category: 'Fashion',
      subCategory: 'Shoes',
      tags: ['leather', ' formal'],
      price: 45,
      images: [PHOTO_URL],
      imageFileIds: ['file1'],
      specs: [{ name: 'Brand', value: 'Mlima' }],
      options: [
        { name: 'Colour', values: [{ label: 'Black', swatch: '#111111' }] },
        { name: 'Size', values: [{ label: '41' }, { label: '42' }] },
      ],
      variants: [
        { choices: { Colour: 'Black', Size: '41' }, stock: 3 },
        {
          choices: { Colour: 'Black', Size: '42' },
          stock: 0,
          price: 50,
          sku: 'BLK-42',
        },
      ],
      paymentOptions: ['full_upfront', 'cash_on_delivery'],
    });
    expect(body.stock).toBeUndefined();

    fireEvent.click(
      screen.getByRole('button', { name: 'Add another product' }),
    );
    expect(
      (screen.getByLabelText('Product title') as HTMLInputElement).value,
    ).toBe('');
    expect(imageRequests('DELETE')).toHaveLength(0);
  });

  it('deletes a photo from ImageKit when the seller removes it', async () => {
    reply('DELETE /api/seller/product-images/file1', 200, {
      success: true,
      data: null,
    });
    renderDashboard(<CreateProductPage />);
    await screen.findByRole('button', { name: 'Save product' });
    await addPhoto();

    fireEvent.click(screen.getByRole('button', { name: 'Remove image 1' }));

    expect(screen.queryByAltText('Product image 1')).toBeNull();
    await waitFor(() => expect(imageRequests('DELETE')).toHaveLength(1));
  });

  it('deletes uploaded photos when the form is cleared', async () => {
    renderDashboard(<CreateProductPage />);
    await screen.findByRole('button', { name: 'Save product' });
    await addPhoto();

    fireEvent.click(screen.getByRole('button', { name: 'Clear form' }));

    await waitFor(() =>
      expect(imageRequests('DELETE').map(([url]) => url)).toEqual([
        '/api/seller/product-images/file1',
      ]),
    );
  });

  it('lets the seller retry a photo that didn’t upload', async () => {
    reply('POST /api/seller/product-images', 502, {
      success: false,
      error: 'We couldn’t upload that photo. Please try again.',
    });
    renderDashboard(<CreateProductPage />);
    await screen.findByRole('button', { name: 'Save product' });
    pickPhoto();

    expect(
      await screen.findByText(
        'We couldn’t upload that photo. Please try again.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
    expect(
      await screen.findByText(
        'Some photos didn’t upload. Retry or remove them.',
      ),
    ).toBeTruthy();

    reply('POST /api/seller/product-images', 200, {
      success: true,
      data: { fileId: 'file1', url: PHOTO_URL },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry uploading image 1' }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Retry uploading image 1' }),
      ).toBeNull(),
    );
    expect(screen.queryByText('Uploading image 1')).toBeNull();
    expect(imageRequests('POST')).toHaveLength(2);
  });

  it('counts the description’s words, not its formatting', async () => {
    await openShoeTemplate();
    fill('Description', '<h2><strong><em>Great shoes</em></strong></h2>');

    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));

    expect(await screen.findByText('Use at least 20 characters')).toBeTruthy();
  });

  it('needs at least one way to pay', async () => {
    await openShoeTemplate();
    const payment = screen.getByRole('group', {
      name: 'How shoppers can pay',
    });
    fireEvent.click(within(payment).getByLabelText(/Full payment upfront/));

    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));

    expect(
      await screen.findByText('Choose at least one way shoppers can pay.'),
    ).toBeTruthy();
  });

  it('shows the server error when saving fails', async () => {
    reply('POST /api/seller/products', 400, {
      success: false,
      error: 'Photos must be JPEG, PNG or WebP images under 500 KB each.',
    });
    renderDashboard(<CreateProductPage />);
    await screen.findByRole('button', { name: 'Save product' });

    await addPhoto();
    fill('Product title', 'Hass avocados');
    fill('Short description', 'Creamy Murang’a avocados');
    fill('Description', 'Hand-picked Hass avocados, ready to eat in two days.');
    select('Sub-category', 'Fruits');
    fill('Price (USD)', '4');
    fill('Stock', '30');

    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Photos must be JPEG, PNG or WebP images under 500 KB each.',
    );
    expect(sentBody('POST /api/seller/products')).toMatchObject({
      subCategory: 'Fruits',
      options: [],
      variants: [],
      stock: 30,
    });
  });

  it('lists a service with a starting price and no options or stock', async () => {
    reply('POST /api/seller/products', 200, {
      success: true,
      message: 'Web app development is now listed.',
      data: { id: 'p9' },
    });
    renderDashboard(<CreateProductPage />);
    await screen.findByRole('button', { name: 'Save product' });

    await addPhoto();
    select('Category', 'Services');
    select('Sub-category', 'Software & IT');
    expect(screen.queryByText('Options')).toBeNull();
    expect(screen.queryByLabelText('Stock')).toBeNull();
    expect(screen.queryByText('How shoppers can pay')).toBeNull();
    expect(screen.getByRole('link', { name: 'service profile' })).toBeTruthy();

    fill('Product title', 'Web app development');
    fill('Short description', 'Booking, shop and dashboard web apps');
    fill(
      'Description',
      'I build fast web apps with React and Node.js, from design to launch.',
    );
    fill('Services offered', 'Web apps, mobile apps');
    fill('Starting price (USD)', '500');
    fireEvent.click(screen.getByLabelText(/Taking new requests/));
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));

    expect(
      await screen.findByText('Web app development is now listed.'),
    ).toBeTruthy();
    expect(sentBody('POST /api/seller/products')).toMatchObject({
      category: 'Services',
      subCategory: 'Software & IT',
      price: 500,
      options: [],
      variants: [],
      stock: 0,
      specs: [{ name: 'Services offered', value: 'Web apps, mobile apps' }],
    });
  }, 15_000);
});

const loafers: Product = {
  id: 'p1',
  name: 'Leather loafers',
  description: 'Soft full-grain leather loafers made in Nairobi.',
  price: 45,
  category: 'Fashion',
  subCategory: 'Shoes',
  imageUrl: '/api/products/p1/images/0',
  inStock: true,
  rating: 0,
  reviewCount: 0,
  options: [
    {
      name: 'Colour',
      values: [{ label: 'Black' }, { label: 'Brown' }],
    },
    { name: 'Size', values: [{ label: '41' }] },
  ],
  variants: [
    { choices: { Colour: 'Black', Size: '41' }, stock: 2 },
    { choices: { Colour: 'Brown', Size: '41' }, stock: 1, price: 50 },
  ],
  stock: 3,
};

const avocados: Product = {
  id: 'p2',
  name: 'Hass avocados',
  description: 'Hand-picked Hass avocados.',
  price: 4,
  category: 'Fruits & Vegetables',
  subCategory: 'Fruits',
  imageUrl: '/api/products/p2/images/0',
  inStock: false,
  rating: 0,
  reviewCount: 0,
  options: [],
  variants: [],
  stock: 0,
};

describe('All products', () => {
  beforeEach(() => {
    pathname = '/dashboard/all-products';
  });

  it('lists products with their price range, options and stock', async () => {
    reply('GET /api/seller/products', 200, {
      success: true,
      data: [loafers, avocados],
    });
    renderDashboard(<AllProductsPage />);

    const list = await screen.findByRole('list', { name: 'Your products' });
    const [first, second] = within(list).getAllByRole('listitem');
    expect(first.textContent).toContain('$45.00 – $50.00');
    expect(first.textContent).toContain('2 colour · 1 size · 2 combinations');
    expect(first.textContent).toContain('Low stock');
    expect(second.textContent).toContain('Out of stock');

    select('Filter by stock', 'out');
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByText('Leather loafers')).toBeNull();
  });

  it('removes a product after confirming', async () => {
    reply('GET /api/seller/products', 200, { success: true, data: [loafers] });
    reply('DELETE /api/seller/products/p1', 200, {
      success: true,
      message: 'Product removed.',
      data: null,
    });
    renderDashboard(<AllProductsPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Remove Leather loafers' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(screen.queryByText('Leather loafers')).toBeNull(),
    );
  });

  it('invites the seller to add a first product', async () => {
    reply('GET /api/seller/products', 200, { success: true, data: [] });
    renderDashboard(<AllProductsPage />);

    expect(await screen.findByText('No products yet')).toBeTruthy();
  });
});
