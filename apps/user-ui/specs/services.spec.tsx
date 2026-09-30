import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product, Provider, ServiceRequest } from '@org/models';
import ProviderPage from '../src/app/providers/[shopId]/page';
import { QueryProvider } from '../src/app/shared/providers/query-provider';
import { takeReturnTo } from '../src/app/shared/utils/return-to';
import { MyServiceRequests } from '../src/app/shared/widgets/my-service-requests';
import { ServicePanel } from '../src/app/shared/widgets/service-panel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ shopId: 'shop1' }),
}));

type Reply = { status: number; body: unknown };
const fetchMock = vi.fn();
const replies = new Map<string, Reply[]>();

/** Queues a reply for `METHOD url`. Unqueued requests answer 404. */
function reply(route: string, status: number, body: unknown) {
  replies.set(route, [...(replies.get(route) ?? []), { status, body }]);
}

const sentBody = (route: string) => {
  const call = fetchMock.mock.calls.findLast(
    ([url, init]) => `${init?.method ?? 'GET'} ${url}` === route,
  );
  if (!call) throw new Error(`No request to ${route}`);
  return JSON.parse((call[1] as RequestInit).body as string);
};

const jane = {
  id: 'u1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  role: 'user',
};

const service: Product = {
  id: 'svc1',
  name: 'Web app development',
  shortDescription: 'Booking, shop and dashboard web apps',
  description: '',
  price: 500,
  category: 'Services',
  subCategory: 'Software & IT',
  imageUrl: 'https://ik.imagekit.io/mlima/products/shop1/app.jpg',
  inStock: true,
  stock: 1,
  rating: 0,
  reviewCount: 0,
  shopId: 'shop1',
  shopName: 'Wanjiru Codes',
};

const provider: Provider = {
  profile: {
    headline: 'Full-stack developer building web and mobile apps',
    about: '',
    skills: ['React', 'Flutter'],
    yearsExperience: 6,
    qualifications: [
      { title: 'BSc Computer Science', issuer: 'JKUAT', year: 2018 },
    ],
    serviceArea: 'Nairobi',
    remote: true,
    portfolio: [],
    shopId: 'shop1',
    shopName: 'Wanjiru Codes',
    updatedAt: '2026-09-20T10:00:00.000Z',
  },
  services: [
    service,
    { ...service, id: 'svc2', name: 'Mobile apps', inStock: false },
  ],
};

const request = (overrides: Partial<ServiceRequest> = {}): ServiceRequest => ({
  id: 'r1',
  productId: 'svc1',
  serviceTitle: 'Web app development',
  shopId: 'shop1',
  shopName: 'Wanjiru Codes',
  clientName: 'Jane Doe',
  clientEmail: 'jane@example.com',
  details: 'A booking site for my salon.',
  budget: 800,
  status: 'pending',
  createdAt: '2026-09-29T09:00:00.000Z',
  updatedAt: '2026-09-29T09:00:00.000Z',
  ...overrides,
});

const renderWithQuery = (ui: React.ReactElement) =>
  render(<QueryProvider>{ui}</QueryProvider>);

beforeEach(() => {
  replies.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const { status, body } = replies
      .get(`${init?.method ?? 'GET'} ${url}`)
      ?.shift() ?? {
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
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Service panel', () => {
  it('shows the provider and sends a request', async () => {
    reply('GET /api/providers/shop1', 200, { success: true, data: provider });
    reply('GET /api/auth/logged-in-user', 200, { success: true, user: jane });
    reply('POST /api/service-requests', 200, {
      success: true,
      message: 'Request sent. Wanjiru Codes will get back to you by email.',
      data: request(),
    });
    renderWithQuery(<ServicePanel product={service} />);

    expect(
      await screen.findByText(
        'Full-stack developer building web and mobile apps',
      ),
    ).toBeTruthy();
    expect(screen.getByText('6 years experience')).toBeTruthy();
    expect(
      screen.getByText('BSc Computer Science · JKUAT · 2018'),
    ).toBeTruthy();
    expect(screen.getByText('Works online')).toBeTruthy();

    fireEvent.change(await screen.findByLabelText('What do you need?'), {
      target: { value: 'A booking site for my salon with M-Pesa.' },
    });
    fireEvent.change(screen.getByLabelText('Budget (USD)'), {
      target: { value: '800' },
    });
    fireEvent.change(screen.getByLabelText('Phone number'), {
      target: { value: '+254 711 222 333' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

    expect(
      await screen.findByText(
        'Request sent. Wanjiru Codes will get back to you by email.',
      ),
    ).toBeTruthy();
    expect(sentBody('POST /api/service-requests')).toEqual({
      productId: 'svc1',
      details: 'A booking site for my salon with M-Pesa.',
      budget: 800,
      phone: '+254711222333',
    });
  });

  it('shows why a request was refused', async () => {
    reply('GET /api/auth/logged-in-user', 200, { success: true, user: jane });
    reply('POST /api/service-requests', 409, {
      success: false,
      error: 'You already have an open request for this service.',
    });
    renderWithQuery(<ServicePanel product={service} />);

    fireEvent.change(await screen.findByLabelText('What do you need?'), {
      target: { value: 'A booking site for my salon with M-Pesa.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'You already have an open request for this service.',
    );
  });

  it('asks signed-out shoppers to log in and brings them back', async () => {
    reply('GET /api/auth/logged-in-user', 401, { success: false });
    reply('POST /api/auth/refresh-token', 401, { success: false });
    renderWithQuery(<ServicePanel product={service} />);

    fireEvent.click(
      await screen.findByRole('link', { name: 'Log in to request' }),
    );
    expect(takeReturnTo()).toBe('/products/svc1');
    expect(takeReturnTo()).toBeUndefined();
  });

  it('hides the form when the provider is fully booked', async () => {
    reply('GET /api/providers/shop1', 200, { success: true, data: provider });
    renderWithQuery(
      <ServicePanel product={{ ...service, inStock: false, stock: 0 }} />,
    );

    expect(await screen.findByText('Wanjiru Codes')).toBeTruthy();
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.queryByText('Log in to request')).toBeNull();
  });
});

describe('Provider page', () => {
  it('lists the provider’s services', async () => {
    reply('GET /api/providers/shop1', 200, { success: true, data: provider });
    renderWithQuery(<ProviderPage />);

    expect(
      await screen.findByRole('heading', {
        name: 'Services from Wanjiru Codes',
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: /Web app development/ })
        .getAttribute('href'),
    ).toBe('/products/svc1');
    expect(screen.getAllByText('From $500.00')).toHaveLength(2);
    expect(screen.getByText('Fully booked')).toBeTruthy();
  });

  it('explains when there is no profile', async () => {
    renderWithQuery(<ProviderPage />);
    expect(await screen.findByText('Provider not found')).toBeTruthy();
  });
});

describe('My service requests', () => {
  it('shows each request with the provider’s reply', async () => {
    reply('GET /api/service-requests/mine', 200, {
      success: true,
      data: [
        request({ status: 'accepted', sellerNote: 'I can start Monday.' }),
        request({ id: 'r2', serviceTitle: 'Logo design', budget: undefined }),
      ],
    });
    renderWithQuery(<MyServiceRequests />);

    expect(await screen.findByText('Accepted')).toBeTruthy();
    expect(screen.getByText('I can start Monday.')).toBeTruthy();
    expect(screen.getByText('Waiting for reply')).toBeTruthy();
    expect(
      screen.getByText(
        /^Wanjiru Codes · sent 29 Sept? 2026 · budget \$800\.00$/,
      ),
    ).toBeTruthy();
  });

  it('points to services when there are none yet', async () => {
    reply('GET /api/service-requests/mine', 200, { success: true, data: [] });
    renderWithQuery(<MyServiceRequests />);

    expect(await screen.findByText('No service requests yet')).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Browse services' })
        .getAttribute('href'),
    ).toBe('/products?category=Services');
  });

  it('renews an expired session before loading', async () => {
    reply('GET /api/service-requests/mine', 401, { success: false });
    reply('POST /api/auth/refresh-token', 200, {
      success: true,
      message: 'ok',
    });
    reply('GET /api/service-requests/mine', 200, {
      success: true,
      data: [request()],
    });
    renderWithQuery(<MyServiceRequests />);

    await waitFor(() =>
      expect(screen.getByText('Waiting for reply')).toBeTruthy(),
    );
  });
});
