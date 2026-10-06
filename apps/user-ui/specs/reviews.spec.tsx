import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Review, ReviewPage } from '@org/models';
import { QueryProvider } from '../src/app/shared/providers/query-provider';
import { ReviewsSection } from '../src/app/shared/widgets/reviews-section';

const REVIEWS_URL = '/api/shops/shop1/reviews';

type Reply = { status: number; body: unknown };
const replies = new Map<string, Reply>();
const reply = (key: string, body: unknown, status = 200) =>
  replies.set(key, { status, body });
const fetchMock = vi.fn();

const review = (id: string, overrides: Partial<Review> = {}): Review => ({
  id,
  rating: 5,
  comment: 'Fresh honey, quick delivery.',
  authorName: 'Wanjiru M.',
  verified: true,
  createdAt: '2026-09-20T08:00:00.000Z',
  updatedAt: '2026-09-20T08:00:00.000Z',
  ...overrides,
});

const reviewPage = (overrides: Partial<ReviewPage> = {}) => ({
  success: true,
  data: {
    items: [
      review('r1'),
      review('r2', {
        rating: 3,
        comment: undefined,
        verified: false,
        authorName: 'Otieno K.',
      }),
    ],
    total: 2,
    page: 1,
    pageSize: 5,
    totalPages: 1,
    summary: { average: 4, count: 2, breakdown: [0, 0, 1, 0, 1] },
    ...overrides,
  } satisfies ReviewPage,
});

const signIn = () =>
  reply('GET /api/auth/logged-in-user', {
    success: true,
    user: { id: 'u1', name: 'Amina Kariuki', email: 'a@x.co', role: 'user' },
  });

const renderSection = () =>
  render(
    <QueryProvider>
      <ReviewsSection
        target={{ kind: 'shops', id: 'shop1' }}
        subject="Mlima Farm"
        returnTo="/shops/shop1"
      />
    </QueryProvider>,
  );

beforeEach(() => {
  replies.clear();
  sessionStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async (url: string, init?: { method?: string }) => {
      const { status, body } = replies.get(
        `${init?.method ?? 'GET'} ${url}`,
      ) ?? { status: 401, body: { success: false, error: 'Unauthorized' } };
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

describe('ReviewsSection', () => {
  it('shows the summary and reviews, and asks guests to log in', async () => {
    reply(`GET ${REVIEWS_URL}?page=1&pageSize=5`, reviewPage());
    renderSection();

    expect(await screen.findByText('4.0')).toBeTruthy();
    expect(screen.getByText('2 reviews')).toBeTruthy();
    const breakdown = screen.getByRole('list', { name: 'Ratings breakdown' });
    expect(within(breakdown).getAllByRole('listitem')).toHaveLength(5);

    const reviews = screen.getByRole('list', { name: 'Customer reviews' });
    expect(
      within(reviews).getByText('Fresh honey, quick delivery.'),
    ).toBeTruthy();
    expect(within(reviews).getAllByText('Verified buyer')).toHaveLength(1);
    expect(within(reviews).getByText('Otieno K.')).toBeTruthy();

    const login = screen.getByRole('link', {
      name: 'Log in to write a review',
    });
    expect(login.getAttribute('href')).toBe('/login');
    fireEvent.click(login);
    expect(sessionStorage.getItem('mlimalink:return-to')).toBe('/shops/shop1');
  });

  it('loads more reviews on request', async () => {
    reply(
      `GET ${REVIEWS_URL}?page=1&pageSize=5`,
      reviewPage({ total: 3, totalPages: 2 }),
    );
    reply(
      `GET ${REVIEWS_URL}?page=2&pageSize=5`,
      reviewPage({
        items: [review('r3', { comment: 'Lovely kale.' })],
        page: 2,
        total: 3,
        totalPages: 2,
      }),
    );
    renderSection();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Show more reviews' }),
    );
    expect(await screen.findByText('Lovely kale.')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Show more reviews' }),
    ).toBeNull();
  });

  it('lets a signed-in shopper post a review', async () => {
    signIn();
    reply(
      `GET ${REVIEWS_URL}?page=1&pageSize=5`,
      reviewPage({
        items: [],
        total: 0,
        summary: { average: 0, count: 0, breakdown: [0, 0, 0, 0, 0] },
      }),
    );
    reply(`POST ${REVIEWS_URL}`, {
      success: true,
      message: 'Thanks for your review!',
      data: review('r9'),
    });
    renderSection();

    expect(
      await screen.findByText(
        'No reviews yet. Be the first to review Mlima Farm.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Post review' }));
    expect(screen.getByRole('alert').textContent).toBe(
      'Choose a rating from 1 to 5 stars.',
    );

    fireEvent.click(screen.getByLabelText('4 stars'));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '  Friendly and fast.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Post review' }));

    expect(await screen.findByText('Thanks for your review!')).toBeTruthy();
    const post = fetchMock.mock.calls.find(
      ([, init]) => (init as { method?: string })?.method === 'POST',
    );
    expect(post?.[0]).toBe(REVIEWS_URL);
    expect(JSON.parse((post?.[1] as { body: string }).body)).toEqual({
      rating: 4,
      comment: 'Friendly and fast.',
    });
  });

  it('prefills the form with the shopper’s own review', async () => {
    signIn();
    reply(
      `GET ${REVIEWS_URL}?page=1&pageSize=5`,
      reviewPage({
        mine: review('r1', { rating: 2, comment: 'Late delivery.' }),
      }),
    );
    renderSection();

    expect(await screen.findByText('Edit your review')).toBeTruthy();
    expect((screen.getByLabelText('2 stars') as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'Late delivery.',
    );
    expect(screen.getByRole('button', { name: 'Update review' })).toBeTruthy();
  });
});
