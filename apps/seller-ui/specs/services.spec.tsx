import type { ReactElement } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OwnServiceProfile, ServiceRequest } from '@org/models';
import DashboardLayout from '../src/app/dashboard/layout';
import ServiceProfilePage from '../src/app/dashboard/service-profile/page';
import ServiceRequestsPage from '../src/app/dashboard/service-requests/page';
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/dashboard/service-profile',
}));

const PHOTO = (name: string) =>
  `https://ik.imagekit.io/mlima/products/shop1/${name}.jpg`;

const profile: OwnServiceProfile = {
  headline: 'Full-stack developer building web and mobile apps',
  about: 'Eight years shipping apps.',
  skills: ['React', 'Node.js'],
  yearsExperience: 8,
  qualifications: [
    {
      title: 'BSc Computer Science',
      issuer: 'University of Nairobi',
      year: 2017,
    },
  ],
  serviceArea: 'Nairobi',
  remote: true,
  portfolio: [PHOTO('booking'), PHOTO('shop')],
  portfolioFileIds: ['file1', 'file2'],
  shopId: 'shop1',
  shopName: 'Mlima Fresh',
  updatedAt: '2026-09-20T10:00:00.000Z',
};

const request = (overrides: Partial<ServiceRequest> = {}): ServiceRequest => ({
  id: 'r1',
  productId: 'p1',
  serviceTitle: 'Web app development',
  shopId: 'shop1',
  shopName: 'Mlima Fresh',
  clientName: 'Brian Kamau',
  clientEmail: 'brian@example.com',
  clientPhone: '+254711222333',
  details: 'I need a booking app for my salon.',
  budget: 800,
  neededBy: '2026-11-15',
  status: 'pending',
  createdAt: '2026-09-29T09:00:00.000Z',
  updatedAt: '2026-09-29T09:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  installFetchMock();
  reply('GET /api/auth/logged-in-seller', 200, {
    success: true,
    seller: { ...seller, shop },
  });
});

const renderDashboard = (page: ReactElement) =>
  renderPage(<DashboardLayout>{page}</DashboardLayout>);

describe('Service profile', () => {
  it('sets up a profile with skills and qualifications', async () => {
    reply('GET /api/seller/service-profile', 200, {
      success: true,
      data: null,
    });
    reply('PUT /api/seller/service-profile', 200, {
      success: true,
      message: 'Your provider profile is saved.',
      data: { ...profile, portfolio: [], portfolioFileIds: [] },
    });
    renderDashboard(<ServiceProfilePage />);

    await screen.findByRole('button', { name: 'Save profile' });
    expect(screen.queryByText('View your public profile')).toBeNull();
    fill('Headline', 'Bridal makeup artist');
    fill('Years of experience', '4');
    fill('Where you work', 'Mombasa');
    fill('Add a skill', 'Bridal makeup');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fill('Add a skill', 'bridal makeup');
    fireEvent.keyDown(screen.getByLabelText('Add a skill'), { key: 'Enter' });
    expect(screen.getByText('bridal makeup is already listed.')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Add a qualification' }),
    );
    fill('Qualification', 'Diploma in Cosmetology');
    fill('Year', '2020');
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(
      await screen.findByText('Your provider profile is saved.'),
    ).toBeTruthy();
    expect(sentBody('PUT /api/seller/service-profile')).toEqual({
      headline: 'Bridal makeup artist',
      about: '',
      skills: ['Bridal makeup'],
      yearsExperience: 4,
      qualifications: [{ title: 'Diploma in Cosmetology', year: 2020 }],
      serviceArea: 'Mombasa',
      remote: false,
      portfolio: [],
      portfolioFileIds: [],
    });
    expect(await screen.findByText('View your public profile')).toBeTruthy();
  }, 15_000);

  it('needs at least one skill', async () => {
    reply('GET /api/seller/service-profile', 200, {
      success: true,
      data: null,
    });
    renderDashboard(<ServiceProfilePage />);

    await screen.findByRole('button', { name: 'Save profile' });
    fill('Headline', 'Bridal makeup artist');
    fill('Years of experience', '4');
    fill('Where you work', 'Mombasa');
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Add at least one skill.',
    );
    expect(() => sentBody('PUT /api/seller/service-profile')).toThrow();
  });

  it('removes a saved photo on save rather than straight away', async () => {
    reply('GET /api/seller/service-profile', 200, {
      success: true,
      data: profile,
    });
    reply('PUT /api/seller/service-profile', 200, {
      success: true,
      data: {
        ...profile,
        portfolio: [PHOTO('shop')],
        portfolioFileIds: ['file2'],
      },
    });
    renderDashboard(<ServiceProfilePage />);

    const skills = await screen.findByRole('list', { name: 'Your skills' });
    expect(within(skills).getByText('React')).toBeTruthy();
    expect(
      (screen.getByLabelText('Qualification') as HTMLInputElement).value,
    ).toBe('BSc Computer Science');
    fireEvent.click(screen.getByRole('button', { name: 'Remove React' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove portfolio photo 1' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() =>
      expect(sentBody('PUT /api/seller/service-profile')).toMatchObject({
        skills: ['Node.js'],
        portfolio: [PHOTO('shop')],
        portfolioFileIds: ['file2'],
      }),
    );
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE'),
    ).toBe(false);
  });
});

describe('Service requests', () => {
  it('shows new requests with the client’s details and contact links', async () => {
    reply('GET /api/seller/service-requests', 200, {
      success: true,
      data: [
        request(),
        request({ id: 'r2', status: 'completed', clientName: 'Faith' }),
      ],
    });
    renderDashboard(<ServiceRequestsPage />);

    const card = await screen.findByRole('article', {
      name: 'Web app development from Brian Kamau',
    });
    expect(card.textContent).toContain('I need a booking app for my salon.');
    expect(card.textContent).toContain('Budget: $800.00');
    expect(card.textContent).toContain('Needed by 15 Nov 2026');
    expect(
      within(card)
        .getByRole('link', { name: /WhatsApp/ })
        .getAttribute('href'),
    ).toBe('https://wa.me/254711222333');
    expect(screen.getByRole('tab', { name: 'New (1)' })).toBeTruthy();
    expect(screen.queryByText(/from Faith/)).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Completed (1)' }));
    expect(
      await screen.findByRole('article', {
        name: 'Web app development from Faith',
      }),
    ).toBeTruthy();
  });

  it('accepts a request with a message', async () => {
    reply('GET /api/seller/service-requests', 200, {
      success: true,
      data: [request()],
    });
    reply('PATCH /api/seller/service-requests/r1', 200, {
      success: true,
      data: request({ status: 'accepted', sellerNote: 'I can start Monday.' }),
    });
    renderDashboard(<ServiceRequestsPage />);

    await screen.findByRole('article');
    fill('Message to Brian Kamau (optional)', 'I can start Monday.');
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Accepted (1)' })).toBeTruthy(),
    );
    expect(sentBody('PATCH /api/seller/service-requests/r1')).toEqual({
      status: 'accepted',
      note: 'I can start Monday.',
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Accepted (1)' }));
    const card = await screen.findByRole('article');
    expect(card.textContent).toContain('You replied: I can start Monday.');
    expect(
      within(card).getByRole('button', { name: 'Mark completed' }),
    ).toBeTruthy();
  });

  it('explains how to get requests when there are none', async () => {
    reply('GET /api/seller/service-requests', 200, { success: true, data: [] });
    renderDashboard(<ServiceRequestsPage />);

    expect(await screen.findByText('No requests yet')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'List a service' })).toBeTruthy();
  });
});
